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
const qualityContractSchema = z.object({
  outcome: z.string().min(12).max(2200),
  successSignals: z.array(z.string().min(4).max(300)).min(1).max(12),
  constraints: z.array(z.string().min(4).max(300)).min(1).max(12),
  nonGoals: z.array(z.string().min(4).max(300)).min(1).max(12),
  risks: z.array(z.object({ risk: z.string().min(4).max(300), mitigation: z.string().min(4).max(500) })).max(12),
  operatorQuestions: z.array(z.string().min(4).max(500)).max(8),
});
const qualityCriticSchema = z.object({
  ambiguityScore: z.number().int().min(0).max(100),
  findings: z.array(z.object({ severity: z.enum(["blocking", "material", "minor"]), finding: z.string().min(4).max(600), recommendedRevision: z.string().min(4).max(600) })).max(12),
  recommendation: z.enum(["ready_for_operator_review", "revise_before_dispatch", "human_review_required"]),
});
const adversarialReviewSchema = z.object({
  materialFinding: z.boolean(),
  summary: z.string().min(4).max(1800),
  criterionFindings: z.array(z.object({ criterionId: z.string().min(1).max(80), assessment: z.enum(["supported", "incomplete", "contradicted", "insufficient_evidence"]), rationale: z.string().min(4).max(700), evidenceReferences: z.array(z.string().min(1).max(500)).max(8) })).max(16),
  operatorQuestions: z.array(z.string().min(4).max(500)).max(8),
});
const recoveryAdvisorSchema = z.object({
  failureNarrative: z.string().min(8).max(1200),
  operatorQuestions: z.array(z.string().min(4).max(500)).max(8),
  evidenceToCollect: z.array(z.string().min(4).max(500)).max(8),
});
export type QualityContract = z.infer<typeof qualityContractSchema>;
export type QualityCritic = z.infer<typeof qualityCriticSchema>;
export type AdversarialReview = z.infer<typeof adversarialReviewSchema>;
export type RecoveryAdvisor = z.infer<typeof recoveryAdvisorSchema>;
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

const qualityContractResponseSchema = {
  type: "OBJECT",
  properties: {
    outcome: { type: "STRING" }, successSignals: { type: "ARRAY", items: { type: "STRING" } }, constraints: { type: "ARRAY", items: { type: "STRING" } }, nonGoals: { type: "ARRAY", items: { type: "STRING" } },
    risks: { type: "ARRAY", items: { type: "OBJECT", properties: { risk: { type: "STRING" }, mitigation: { type: "STRING" } }, required: ["risk", "mitigation"] } }, operatorQuestions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["outcome", "successSignals", "constraints", "nonGoals", "risks", "operatorQuestions"],
};
const qualityCriticResponseSchema = {
  type: "OBJECT",
  properties: { ambiguityScore: { type: "INTEGER" }, findings: { type: "ARRAY", items: { type: "OBJECT", properties: { severity: { type: "STRING", enum: ["blocking", "material", "minor"] }, finding: { type: "STRING" }, recommendedRevision: { type: "STRING" } }, required: ["severity", "finding", "recommendedRevision"] } }, recommendation: { type: "STRING", enum: ["ready_for_operator_review", "revise_before_dispatch", "human_review_required"] } },
  required: ["ambiguityScore", "findings", "recommendation"],
};
const adversarialResponseSchema = {
  type: "OBJECT",
  properties: { materialFinding: { type: "BOOLEAN" }, summary: { type: "STRING" }, criterionFindings: { type: "ARRAY", items: { type: "OBJECT", properties: { criterionId: { type: "STRING" }, assessment: { type: "STRING", enum: ["supported", "incomplete", "contradicted", "insufficient_evidence"] }, rationale: { type: "STRING" }, evidenceReferences: { type: "ARRAY", items: { type: "STRING" } } }, required: ["criterionId", "assessment", "rationale", "evidenceReferences"] } }, operatorQuestions: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["materialFinding", "summary", "criterionFindings", "operatorQuestions"],
};
const recoveryAdvisorResponseSchema = {
  type: "OBJECT",
  properties: { failureNarrative: { type: "STRING" }, operatorQuestions: { type: "ARRAY", items: { type: "STRING" } }, evidenceToCollect: { type: "ARRAY", items: { type: "STRING" } } },
  required: ["failureNarrative", "operatorQuestions", "evidenceToCollect"],
};

function providerError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = typeof error.response?.data?.error?.message === "string" ? error.response.data.error.message : error.message;
    return new Error(message || `Provider request failed with ${error.response?.status ?? "network error"}`);
  }
  return error instanceof Error ? error : new Error("Provider request failed.");
}

type JulesSourceSummary = { name?: string; id?: string; githubRepo?: { owner?: string; repo?: string; branches?: Array<{ displayName?: string }> } };

export function matchJulesSource(sources: JulesSourceSummary[], repository: string) {
  const [owner = "", repo = ""] = repository.trim().split("/");
  const ownerKey = owner.toLowerCase();
  const repoKey = repo.toLowerCase();
  return sources.find(source => source.githubRepo?.owner?.toLowerCase() === ownerKey && source.githubRepo?.repo?.toLowerCase() === repoKey)
    ?? sources.find(source => source.name?.toLowerCase() === `sources/github-${ownerKey}-${repoKey}` || source.id?.toLowerCase() === `github-${ownerKey}-${repoKey}`);
}

export function missingJulesSourceMessage(repository: string) {
  return `Jules has no connected source for '${repository}'. In the Jules web app, connect this GitHub repository to the same Google account as this API key, then retry dispatch. The Jules API can read sources but cannot create a repository connection.`;
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

async function generateGeminiStructured<T>(secret: string, instruction: string, responseSchema: unknown, parse: (value: unknown) => T) {
  try {
    const response = await axios.post(`${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(secret)}`,
      { contents: [{ role: "user", parts: [{ text: instruction }] }], generationConfig: { responseMimeType: "application/json", responseSchema, temperature: 0.1, maxOutputTokens: 5000 } },
      { timeout: 45000 });
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("Gemini returned no structured assessment.");
    return parse(JSON.parse(text));
  } catch (error) { throw providerError(error); }
}

export async function generateQualityContract(secret: string, input: { prompt: string; repository: string; branch: string }) {
  const contract = await generateGeminiStructured(secret,
    `Act as a bounded delivery-contract planner. Create a concise acceptance contract for this coding initiative. This is a planning artifact only: do not claim code was changed, do not assume secrets, do not authorize dispatch, and keep all constraints reviewable by an operator. Repository: ${input.repository}; target branch: ${input.branch}. Initiative request:\n${input.prompt}`,
    qualityContractResponseSchema, value => qualityContractSchema.parse(value));
  const critic = await generateGeminiStructured(secret,
    `Act as an independent contract critic. Review this proposed delivery contract against the original initiative. Flag ambiguity, missing measurable success signals, scope expansion, and unsafe assumptions. You only advise an operator; you must not approve work or request automatic dispatch. Original initiative:\n${input.prompt}\n\nProposed contract:\n${JSON.stringify(contract)}`,
    qualityCriticResponseSchema, value => qualityCriticSchema.parse(value));
  return { contract, critic };
}

export async function runAdversarialQualityReview(secret: string, input: { taskTitle: string; taskDescription: string; criteria: Array<{ id: string; text: string; deterministicStatus: string }>; evidence: Array<{ criterionId: string; status: string; label: string; reference?: string | null; detail?: string | null }> }) {
  return generateGeminiStructured(secret,
    `Act as a bounded adversarial verification reviewer. Review only the supplied local evidence for the completed Jules task below. Do not infer unlisted test results, diffs, files, or provider behavior. For every finding, cite only supplied evidence reference strings; an empty reference list is required if the evidence does not support the claim. Your analysis cannot override deterministic failures and never authorizes acceptance or redispatch.\n\nTask: ${input.taskTitle}\n${input.taskDescription}\n\nAcceptance criteria and deterministic status:\n${JSON.stringify(input.criteria)}\n\nEvidence:\n${JSON.stringify(input.evidence)}`,
    adversarialResponseSchema, value => adversarialReviewSchema.parse(value));
}

export async function analyzeQualityRecovery(secret: string, input: { taskTitle: string; failureDomain: string; deterministicRecommendation: string; failureText?: string | null; deterministicFacts: unknown }) {
  return generateGeminiStructured(secret,
    `Act as a bounded failure-analysis adviser. The deterministic recovery domain and recommendation below are authoritative. Explain only what an operator should inspect, what evidence is still needed, and what question needs a decision. Do not recommend automatic redispatch, scope expansion, credential rotation, or provider-side changes.\n\nTask: ${input.taskTitle}\nDeterministic failure domain: ${input.failureDomain}\nDeterministic recommendation: ${input.deterministicRecommendation}\nObserved failure text: ${input.failureText ?? "none"}\nDeterministic facts: ${JSON.stringify(input.deterministicFacts)}`,
    recoveryAdvisorResponseSchema, value => recoveryAdvisorSchema.parse(value));
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
    const sources: JulesSourceSummary[] = [];
    let pageToken: string | undefined;
    do {
      const response = await axios.get(`${JULES_BASE_URL}/sources`, { headers: { "x-goog-api-key": secret }, params: { pageSize: 100, ...(pageToken ? { pageToken } : {}) }, timeout: 15000 });
      sources.push(...(response.data?.sources ?? []));
      pageToken = response.data?.nextPageToken;
    } while (pageToken);
    const source = matchJulesSource(sources, repository);
    if (!source?.name) return { ok: false as const, message: missingJulesSourceMessage(repository) };
    const branches = source.githubRepo?.branches?.map((item: any) => item.displayName) ?? [];
    if (branches.length > 0 && !branches.includes(branch)) return { ok: false as const, message: `Jules source '${repository}' is connected, but branch '${branch}' is unavailable. Refresh the repository connection in Jules or choose a listed branch.` };
    return { ok: true as const, sourceName: source.name };
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
    const session = await axios.get(`${JULES_BASE_URL}/${sessionName}`, { headers: { "x-goog-api-key": secret }, timeout: 20000 });
    const activities: any[] = []; let pageToken: string | undefined;
    do {
      const response = await axios.get(`${JULES_BASE_URL}/${sessionName}/activities`, { headers: { "x-goog-api-key": secret }, params: { pageSize: 100, ...(pageToken ? { pageToken } : {}) }, timeout: 20000 });
      activities.push(...(response.data?.activities ?? [])); pageToken = response.data?.nextPageToken;
    } while (pageToken);
    return { session: session.data, activities };
  } catch (error) {
    throw providerError(error);
  }
}

export async function deleteJulesSession(secret: string, sessionName: string) {
  try {
    const response = await axios.delete(`${JULES_BASE_URL}/${sessionName}`, { headers: { "x-goog-api-key": secret }, timeout: 20000 });
    return response.data;
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
