import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { initiatives, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const userId = 987654331;

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
  for (const initiative of rows) await db.delete(tasks).where(eq(tasks.initiativeId, initiative.id));
  await db.delete(initiatives).where(eq(initiatives.userId, userId));
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
});
