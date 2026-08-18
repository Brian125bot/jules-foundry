import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn(), isAxiosError: vi.fn(() => false) } }));

import axios from "axios";
import { eq } from "drizzle-orm";
import { credentialProfiles, initiatives, taskEvents, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const userId = 987654331;
const getMock = vi.mocked(axios.get);
const postMock = vi.mocked(axios.post);

function context(): TrpcContext {
  return {
    user: { id: userId, openId: "gemini-model-router-user", name: "Gemini model router user", email: null, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select({ id: initiatives.id }).from(initiatives).where(eq(initiatives.userId, userId));
  for (const initiative of rows) {
    const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.initiativeId, initiative.id));
    for (const task of taskRows) await db.delete(taskEvents).where(eq(taskEvents.taskId, task.id));
    await db.delete(tasks).where(eq(tasks.initiativeId, initiative.id));
  }
  await db.delete(initiatives).where(eq(initiatives.userId, userId));
  await db.delete(credentialProfiles).where(eq(credentialProfiles.userId, userId));
  getMock.mockReset(); postMock.mockReset();
});

describe("initiative Gemini model persistence", () => {
  it("persists an allowlisted operator selection and retains it in the initiative read model", async () => {
    const caller = appRouter.createCaller(context());
    const created = await caller.foundry.initiatives.create({ title: "Select a Gemini model", prompt: "Plan a bounded and reviewable documentation update with explicit acceptance criteria.", repository: "acme/docs", branch: "main", geminiModel: "gemini-3.6-flash", budgetCents: 500 });
    const db = await getDb();
    if (!db) return;
    const stored = (await db.select().from(initiatives).where(eq(initiatives.id, created.id)).limit(1))[0];
    expect(stored?.geminiModel).toBe("gemini-3.6-flash");
    const listed = await caller.foundry.initiatives.list();
    expect(listed.find(item => item.id === created.id)?.geminiModel).toBe("gemini-3.6-flash");
  });

  it("rejects an unsupported model before it can be persisted", async () => {
    const caller = appRouter.createCaller(context());
    await expect(caller.foundry.initiatives.create({ title: "Reject unsupported model", prompt: "Plan a bounded and reviewable documentation update with explicit acceptance criteria.", repository: "acme/docs", branch: "main", geminiModel: "gemini-unknown-preview", budgetCents: 500 })).rejects.toThrow();
  });

  it("validates the persisted model against the live catalog and sends that exact selection to Gemini compilation", async () => {
    const caller = appRouter.createCaller(context());
    await caller.foundry.credentials.save({ provider: "gemini", label: "selector-workflow-gemini", secret: "selector-workflow-gemini-key" });
    const created = await caller.foundry.initiatives.create({ title: "Compile with selected model", prompt: "Plan a bounded documentation update with explicit acceptance criteria and no unrelated changes.", repository: "acme/docs", branch: "main", geminiModel: "gemini-3.6-flash", budgetCents: 500 });
    getMock.mockResolvedValue({ data: { models: [{ name: "models/gemini-3.6-flash", supportedGenerationMethods: ["generateContent"] }] } } as never);
    postMock.mockResolvedValue({ data: { candidates: [{ content: { parts: [{ text: JSON.stringify({ tasks: [{ title: "Document the model selector", description: "Document the initiative model selector and its provider validation boundary.", riskTier: "green", allowedPaths: ["docs/gemini_model_selection_policy.md"], nonGoals: ["Do not change provider credentials."], acceptanceCriteria: [{ id: "AC-1", text: "The policy documents the persisted Gemini model selection." }], dependencies: [] }] }) }] } }] } } as never);

    await expect(caller.foundry.initiatives.compile({ initiativeId: created.id })).resolves.toMatchObject({ taskCount: 1 });
    expect(postMock.mock.calls[0]?.[0]).toContain("/models/gemini-3.6-flash:generateContent");
    const db = await getDb();
    if (!db) return;
    const task = (await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.initiativeId, created.id)).limit(1))[0];
    const event = (await db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).limit(1))[0];
    expect(event.metadata).toContain("gemini-3.6-flash");
  });
});
