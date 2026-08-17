import axios from "axios";
import { z } from "zod";

const JULES_BASE_URL = "https://jules.googleapis.com/v1alpha";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const compiledTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10),
  riskTier: z.enum(["green", "amber", "red"]),
  allowedPaths: z.array(z.string().min(1)).min(1).max(12),
  nonGoals: z.array(z.string().min(3)).min(1).max(8),
  acceptanceCriteria: z.array(z.object({ id: z.string().min(1), text: z.string().min(5) })).min(1).max(8),
  dependencies: z.array(z.string()).max(12),
});

export const compiledInitiativeSchema = z.object({ tasks: z.array(compiledTaskSchema).min(1).max(12) });
export type CompiledInitiative = z.infer<typeof compiledInitiativeSchema>;
const rawCompiledTaskSchema = compiledTaskSchema.extend({ allowedPaths: z.array(z.string().min(1)).max(12).optional() });
const rawCompiledInitiativeSchema = z.object({ tasks: z.array(rawCompiledTaskSchema).min(1).max(12) });
export const SCOPE_REVIEW_PATH = "__SCOPE_REVIEW_REQUIRED__";
export const requiresScopeReview = (allowedPaths: string[]) => allowedPaths.includes(SCOPE_REVIEW_PATH);

/**
 * Gemini can occasionally emit an empty allowedPaths array even when the response schema asks for one.
 * Preserve the packet for review, but never widen scope silently: the sentinel triggers a dispatch block.
 */
export function normalizeCompiledInitiative(input: unknown): CompiledInitiative {
  const raw = rawCompiledInitiativeSchema.parse(input);
  return compiledInitiativeSchema.parse({
    tasks: raw.tasks.map(task => {
      const normalizedPaths = task.allowedPaths?.map(path => path.trim()).filter(Boolean) ?? [];
      if (normalizedPaths.length > 0) return { ...task, allowedPaths: normalizedPaths };
      return {
        ...task,
        riskTier: "red" as const,
        allowedPaths: [SCOPE_REVIEW_PATH],
        nonGoals: Array.from(new Set([...task.nonGoals, "Do not modify repository files until allowed paths are explicitly reviewed."])),
      };
    }),
  });
}

const geminiResponseSchema = {
  type: "OBJECT",
  properties: {
    tasks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          description: { type: "STRING" },
          riskTier: { type: "STRING", enum: ["green", "amber", "red"] },
          allowedPaths: { type: "ARRAY", items: { type: "STRING" } },
          nonGoals: { type: "ARRAY", items: { type: "STRING" } },
          acceptanceCriteria: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: { id: { type: "STRING" }, text: { type: "STRING" } },
              required: ["id", "text"],
            },
          },
          dependencies: { type: "ARRAY", items: { type: "STRING" } },
        },
        required: ["title", "description", "riskTier", "allowedPaths", "nonGoals", "acceptanceCriteria", "dependencies"],
      },
    },
  },
  required: ["tasks"],
};

function providerError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = typeof error.response?.data?.error?.message === "string" ? error.response.data.error.message : error.message;
    return new Error(message || `Provider request failed with ${error.response?.status ?? "network error"}`);
  }
  return error instanceof Error ? error : new Error("Provider request failed.");
}

export async function testCredential(provider: "jules" | "gemini" | "github", secret: string) {
  try {
    if (provider === "jules") {
      await axios.get(`${JULES_BASE_URL}/sources?pageSize=1`, { headers: { "x-goog-api-key": secret }, timeout: 12000 });
    }
    if (provider === "gemini") {
      await axios.get(`${GEMINI_BASE_URL}/models`, { params: { key: secret }, timeout: 12000 });
    }
    if (provider === "github") {
      await axios.get("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${secret}`, Accept: "application/vnd.github+json" },
        timeout: 12000,
      });
    }
    return { ok: true as const, message: "Connection verified" };
  } catch (error) {
    return { ok: false as const, message: providerError(error).message.slice(0, 280) };
  }
}

export async function compileWithGemini(secret: string, input: { prompt: string; repository: string; branch: string }) {
  try {
    const instruction = `You are a senior software delivery planner. Compile the request into an ordered dependency DAG of focused coding tasks. Repository: ${input.repository}; target branch: ${input.branch}. Every task must specify concrete, non-empty repository-relative allowed paths, non-goals, acceptance criteria, and dependencies by task title. Never return an empty allowedPaths array. Avoid implementation steps that access production secrets or perform destructive operations. User request:\n${input.prompt}`;
    const response = await axios.post(
      `${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(secret)}`,
      {
        contents: [{ role: "user", parts: [{ text: instruction }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: geminiResponseSchema, temperature: 0.2 },
      },
      { timeout: 45000 },
    );
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no structured task graph.");
    return normalizeCompiledInitiative(JSON.parse(text));
  } catch (error) {
    throw providerError(error);
  }
}

export async function validateGitHubBranch(secret: string, repository: string, branch: string) {
  try {
    await axios.get(`https://api.github.com/repos/${repository}/branches/${encodeURIComponent(branch)}`, {
      headers: { Authorization: `Bearer ${secret}`, Accept: "application/vnd.github+json" },
      timeout: 15000,
    });
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, message: providerError(error).message };
  }
}

export async function findJulesSource(secret: string, repository: string, branch: string) {
  try {
    const response = await axios.get(`${JULES_BASE_URL}/sources?pageSize=100`, { headers: { "x-goog-api-key": secret }, timeout: 15000 });
    const [owner, repo] = repository.split("/");
    const source = (response.data?.sources ?? []).find((item: any) => item.githubRepo?.owner === owner && item.githubRepo?.repo === repo);
    if (!source) return { ok: false as const, message: "The repository is not connected as a Jules source." };
    const branches = source.githubRepo?.branches?.map((item: any) => item.displayName) ?? [];
    if (branches.length > 0 && !branches.includes(branch)) return { ok: false as const, message: "The selected branch is not available in the Jules source." };
    return { ok: true as const, sourceName: source.name as string };
  } catch (error) {
    return { ok: false as const, message: providerError(error).message };
  }
}

export async function createJulesSession(secret: string, input: { prompt: string; title: string; sourceName: string; branch: string; requirePlanApproval: boolean; autoCreatePr: boolean }) {
  try {
    const response = await axios.post(
      `${JULES_BASE_URL}/sessions`,
      {
        prompt: input.prompt,
        title: input.title,
        sourceContext: { source: input.sourceName, githubRepoContext: { startingBranch: input.branch } },
        requirePlanApproval: input.requirePlanApproval,
        ...(input.autoCreatePr ? { automationMode: "AUTO_CREATE_PR" } : {}),
      },
      { headers: { "x-goog-api-key": secret, "Content-Type": "application/json" }, timeout: 45000 },
    );
    return response.data;
  } catch (error) {
    throw providerError(error);
  }
}

export async function pollJulesSession(secret: string, sessionName: string) {
  try {
    const [session, activities] = await Promise.all([
      axios.get(`${JULES_BASE_URL}/${sessionName}`, { headers: { "x-goog-api-key": secret }, timeout: 20000 }),
      axios.get(`${JULES_BASE_URL}/${sessionName}/activities?pageSize=100`, { headers: { "x-goog-api-key": secret }, timeout: 20000 }),
    ]);
    return { session: session.data, activities: activities.data?.activities ?? [] };
  } catch (error) {
    throw providerError(error);
  }
}

export async function approveJulesPlan(secret: string, sessionName: string) {
  try {
    await axios.post(`${JULES_BASE_URL}/${sessionName}:approvePlan`, {}, { headers: { "x-goog-api-key": secret }, timeout: 20000 });
  } catch (error) {
    throw providerError(error);
  }
}

export async function messageJulesSession(secret: string, sessionName: string, prompt: string) {
  try {
    await axios.post(`${JULES_BASE_URL}/${sessionName}:sendMessage`, { prompt }, { headers: { "x-goog-api-key": secret }, timeout: 20000 });
  } catch (error) {
    throw providerError(error);
  }
}
