import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { initiatives, taskApprovals, taskAttempts, taskEvents, taskEvidence, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const testUserId = 987654324;

function context(): TrpcContext {
  return { user: { id: testUserId, openId: "initiative-delete-user", name: "Initiative delete user", email: null, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] };
}

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  const taskRows = await db.select({ id: tasks.id }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(eq(initiatives.userId, testUserId));
  for (const task of taskRows) {
    await db.delete(taskApprovals).where(eq(taskApprovals.taskId, task.id)); await db.delete(taskAttempts).where(eq(taskAttempts.taskId, task.id)); await db.delete(taskEvents).where(eq(taskEvents.taskId, task.id)); await db.delete(taskEvidence).where(eq(taskEvidence.taskId, task.id)); await db.delete(tasks).where(eq(tasks.id, task.id));
  }
  await db.delete(initiatives).where(eq(initiatives.userId, testUserId));
});

describe("initiative deletion", () => {
  it("deletes a confirmed inactive initiative and its Foundry records", async () => {
    const db = await getDb(); if (!db) return;
    const title = "Delete inactive initiative";
    const initiativeId = Number((await db.insert(initiatives).values({ userId: testUserId, title, prompt: "Delete test initiative", repository: "owner/repository", branch: "main", budgetCents: 100 }))[0].insertId);
    const taskId = Number((await db.insert(tasks).values({ initiativeId, taskKey: "delete-inactive", title: "Inactive task", description: "A task that can be safely removed.", riskTier: "green", allowedPaths: "[\"README.md\"]", nonGoals: "[\"No changes\"]", acceptanceCriteria: "[]", dependencies: "[]", idempotencyKey: "delete-inactive-key" }))[0].insertId);
    await db.insert(taskEvents).values({ eventId: "delete-inactive-event", taskId, source: "local", eventType: "created", summary: "Created for deletion test." });
    const caller = appRouter.createCaller(context());
    await expect(caller.foundry.initiatives.deletePreview({ initiativeId })).resolves.toMatchObject({ taskCount: 1, canDelete: true });
    await expect(caller.foundry.initiatives.remove({ initiativeId, confirmation: title })).resolves.toMatchObject({ success: true, deletedTaskCount: 1 });
    expect(await db.select().from(initiatives).where(eq(initiatives.id, initiativeId))).toHaveLength(0);
    expect(await db.select().from(tasks).where(eq(tasks.id, taskId))).toHaveLength(0);
    expect(await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId))).toHaveLength(0);
  });

  it("refuses deletion while a Jules session is active", async () => {
    const db = await getDb(); if (!db) return;
    const title = "Protect active initiative";
    const initiativeId = Number((await db.insert(initiatives).values({ userId: testUserId, title, prompt: "Protect test initiative", repository: "owner/repository", branch: "main", budgetCents: 100 }))[0].insertId);
    await db.insert(tasks).values({ initiativeId, taskKey: "active-delete-block", title: "Active task", description: "An active Jules task cannot be deleted.", riskTier: "green", allowedPaths: "[\"README.md\"]", nonGoals: "[\"No changes\"]", acceptanceCriteria: "[]", dependencies: "[]", idempotencyKey: "active-delete-block-key", state: "executing", julesSessionName: "sessions/active-delete-block" });
    const caller = appRouter.createCaller(context());
    await expect(caller.foundry.initiatives.remove({ initiativeId, confirmation: title })).rejects.toThrow(/Jules session.*active/i);
  });
});
