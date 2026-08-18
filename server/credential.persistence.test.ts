import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { credentialProfiles, initiatives, taskAttempts, taskEvents, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { SCOPE_REVIEW_PATH } from "./services/providers";

const testUserId = 987654321;
const scopeReviewUserId = 987654322;
const tokenPrefix = `vault-regression-${Date.now()}`;

function context(userId = testUserId): TrpcContext {
  return {
    user: {
      id: userId,
      openId: "vault-regression-user",
      name: "Vault regression user",
      email: null,
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  const scopeTasks = await db.select({ id: tasks.id }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(eq(initiatives.userId, scopeReviewUserId));
  if (scopeTasks.length) {
    const ids = scopeTasks.map(task => task.id);
    for (const taskId of ids) {
      await db.delete(taskEvents).where(eq(taskEvents.taskId, taskId));
      await db.delete(taskAttempts).where(eq(taskAttempts.taskId, taskId));
    }
    for (const taskId of ids) await db.delete(tasks).where(eq(tasks.id, taskId));
  }
  await db.delete(initiatives).where(eq(initiatives.userId, scopeReviewUserId));
  await db.delete(credentialProfiles).where(eq(credentialProfiles.userId, testUserId));
});

describe("credential persistence", () => {
  it("creates, duplicate-upserts, and consolidates provider-label profiles without returning secret values", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(context());
    const targetLabel = `${tokenPrefix}-target`;
    const sourceLabel = `${tokenPrefix}-source`;

    const first = await caller.foundry.credentials.save({ provider: "jules", label: targetLabel, secret: "vault-test-secret-one" });
    const repeated = await caller.foundry.credentials.save({ provider: "jules", label: targetLabel, secret: "vault-test-secret-two" });
    const source = await caller.foundry.credentials.save({ provider: "jules", label: sourceLabel, secret: "vault-test-secret-three" });
    const rotated = await caller.foundry.credentials.save({ credentialId: source.id, provider: "jules", label: targetLabel, secret: "vault-test-secret-four" });
    const profiles = await caller.foundry.credentials.list();
    const rows = await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.userId, testUserId), eq(credentialProfiles.provider, "jules")));

    expect(first.updated).toBe(false);
    expect(repeated).toMatchObject({ id: first.id, updated: true });
    expect(rotated).toMatchObject({ id: first.id, updated: true, consolidated: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first.id);
    expect(rows[0]?.version).toBe(3);
    expect(profiles[0]).not.toHaveProperty("encryptedSecret");
    expect(profiles[0]?.maskedSecret).toMatch(/^••••••••/);
    expect(JSON.stringify(profiles)).not.toContain("vault-test-secret-four");
  });
});

describe("scope-review dispatch guard", () => {
  it("blocks a persisted scope-review task before provider credentials or Jules dispatch are attempted", async () => {
    const db = await getDb();
    if (!db) return;
    const initiativeResult = await db.insert(initiatives).values({ userId: scopeReviewUserId, title: "Scope review regression", prompt: "Regression task", repository: "owner/repository", branch: "main", budgetCents: 100 });
    const initiativeId = Number(initiativeResult.lastInsertRowid);
    const taskResult = await db.insert(tasks).values({
      initiativeId,
      taskKey: `${tokenPrefix}-scope-task`,
      title: "Review missing scope",
      description: "The task packet has no concrete repository paths.",
      riskTier: "red",
      allowedPaths: JSON.stringify([SCOPE_REVIEW_PATH]),
      nonGoals: JSON.stringify(["Do not change code before scope review."]),
      acceptanceCriteria: JSON.stringify([{ id: "AC-1", text: "Scope must be approved." }]),
      dependencies: JSON.stringify([]),
      idempotencyKey: `${tokenPrefix}-scope-dispatch`,
    });
    const taskId = Number(taskResult.lastInsertRowid);
    const caller = appRouter.createCaller(context(scopeReviewUserId));

    await expect(caller.foundry.dispatch.run({ taskId, requirePlanApproval: true, autoCreatePr: true })).rejects.toThrow(/scope requires review/i);
    const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));

    expect(task).toMatchObject({ state: "blocked", health: "attention" });
    expect(task?.julesSessionName).toBeNull();
    expect(events.some(event => event.eventType === "scope_review_required")).toBe(true);
  });
});
