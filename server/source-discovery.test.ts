import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), isAxiosError: vi.fn(() => false) } }));

import axios from "axios";
import { and, eq } from "drizzle-orm";
import { credentialProfiles, initiatives, taskAttempts, taskEvents, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { findJulesSource } from "./services/providers";

const sourceTestUserId = 987654323;
const getMock = vi.mocked(axios.get);

function context(): TrpcContext {
  return {
    user: { id: sourceTestUserId, openId: "source-discovery-user", name: "Source discovery user", email: null, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

afterEach(async () => {
  getMock.mockReset();
  const db = await getDb();
  if (!db) return;
  const userTasks = await db.select({ id: tasks.id }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(eq(initiatives.userId, sourceTestUserId));
  for (const task of userTasks) {
    await db.delete(taskEvents).where(eq(taskEvents.taskId, task.id));
    await db.delete(taskAttempts).where(eq(taskAttempts.taskId, task.id));
    await db.delete(tasks).where(eq(tasks.id, task.id));
  }
  await db.delete(initiatives).where(eq(initiatives.userId, sourceTestUserId));
  await db.delete(credentialProfiles).where(eq(credentialProfiles.userId, sourceTestUserId));
});

describe("Jules source discovery", () => {
  it("walks paginated source lists and returns specific missing-source and branch guidance", async () => {
    getMock
      .mockResolvedValueOnce({ data: { sources: [{ name: "sources/github-other-repo", githubRepo: { owner: "other", repo: "repo", branches: [] } }], nextPageToken: "page-2" } })
      .mockResolvedValueOnce({ data: { sources: [{ name: "sources/github-brian125bot-getit", githubRepo: { owner: "Brian125Bot", repo: "GetIt", branches: [{ displayName: "main" }] } }] } });
    await expect(findJulesSource("test-key", "brian125bot/getit", "main")).resolves.toMatchObject({ ok: true, sourceName: "sources/github-brian125bot-getit" });
    expect(getMock).toHaveBeenCalledTimes(2);

    getMock.mockReset().mockResolvedValue({ data: { sources: [{ name: "sources/github-brian125bot-getit", githubRepo: { owner: "brian125bot", repo: "getit", branches: [{ displayName: "main" }] } }] } });
    await expect(findJulesSource("test-key", "brian125bot/getit", "develop")).resolves.toMatchObject({ ok: false, message: expect.stringContaining("branch 'develop' is unavailable") });

    getMock.mockReset().mockResolvedValue({ data: { sources: [] } });
    await expect(findJulesSource("test-key", "brian125bot/getit", "main")).resolves.toMatchObject({ ok: false, message: expect.stringContaining("connect this GitHub repository") });
  });

  it("persists actionable source-connection guidance when dispatch is blocked before session creation", async () => {
    const db = await getDb();
    if (!db) return;
    getMock.mockImplementation(async url => {
      if (String(url).startsWith("https://api.github.com/repos/")) return { data: { name: "main" } } as never;
      if (String(url).endsWith("/sources")) return { data: { sources: [] } } as never;
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    const caller = appRouter.createCaller(context());
    await caller.foundry.credentials.save({ provider: "jules", label: "source-test-jules", secret: "source-test-jules-key" });
    await caller.foundry.credentials.save({ provider: "github", label: "source-test-github", secret: "source-test-github-token" });
    const initiativeResult = await db.insert(initiatives).values({ userId: sourceTestUserId, title: "Source failure regression", prompt: "Regression task", repository: "brian125bot/getit", branch: "main", budgetCents: 100 });
    const initiativeId = Number(initiativeResult[0].insertId);
    const taskResult = await db.insert(tasks).values({ initiativeId, taskKey: "source-failure-task", title: "Verify source failure", description: "Check actionable source error handling.", riskTier: "green", allowedPaths: JSON.stringify(["README.md"]), nonGoals: JSON.stringify(["Do not dispatch when the source is absent."]), acceptanceCriteria: JSON.stringify([{ id: "AC-1", text: "An actionable source error is shown." }]), dependencies: JSON.stringify([]), idempotencyKey: "source-failure-dispatch" });
    const taskId = Number(taskResult[0].insertId);

    await expect(caller.foundry.dispatch.run({ taskId, requirePlanApproval: true, autoCreatePr: true })).rejects.toThrow(/connect this GitHub repository/i);
    const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    expect(task).toMatchObject({ state: "ready", health: "attention", reservationConflict: null, blockedReason: null });
    expect(task?.julesSessionName).toBeNull();
    expect(task?.lastError).toContain("connect this GitHub repository");
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));
    expect(events.some(event => event.eventType === "reservation_released")).toBe(true);
  });
});

describe("released reservation exclusion", () => {
  it("does not block an overlapping sibling after the first task fails before session creation", async () => {
    const db = await getDb();
    if (!db) return;
    getMock.mockImplementation(async url => {
      if (String(url).startsWith("https://api.github.com/repos/")) return { data: { name: "main" } } as never;
      if (String(url).endsWith("/sources")) return { data: { sources: [] } } as never;
      throw new Error(`Unexpected request: ${String(url)}`);
    });
    const caller = appRouter.createCaller(context());
    await caller.foundry.credentials.save({ provider: "jules", label: "release-test-jules", secret: "release-test-jules-key" });
    await caller.foundry.credentials.save({ provider: "github", label: "release-test-github", secret: "release-test-github-token" });
    const initiativeResult = await db.insert(initiatives).values({ userId: sourceTestUserId, title: "Reservation release regression", prompt: "Regression task", repository: "brian125bot/getit", branch: "main", budgetCents: 100 });
    const initiativeId = Number(initiativeResult[0].insertId);
    const makeTask = async (title: string, key: string) => Number((await db.insert(tasks).values({ initiativeId, taskKey: key, title, description: "An overlapping task that must reach provider validation after sibling failure.", riskTier: "green", allowedPaths: JSON.stringify(["README.md"]), nonGoals: JSON.stringify(["Do not create a session without a source."]), acceptanceCriteria: JSON.stringify([{ id: "AC-1", text: "The task reaches source validation." }]), dependencies: JSON.stringify([]), idempotencyKey: `${key}-dispatch` }))[0].insertId);
    const firstTaskId = await makeTask("First overlapping task", "release-first");
    const secondTaskId = await makeTask("Second overlapping task", "release-second");

    await expect(caller.foundry.dispatch.run({ taskId: firstTaskId, requirePlanApproval: true, autoCreatePr: true })).rejects.toThrow(/connect this GitHub repository/i);
    await expect(caller.foundry.dispatch.run({ taskId: secondTaskId, requirePlanApproval: true, autoCreatePr: true })).rejects.toThrow(/connect this GitHub repository/i);
    const secondTask = (await db.select().from(tasks).where(eq(tasks.id, secondTaskId)).limit(1))[0];
    expect(secondTask).toMatchObject({ state: "ready", reservationConflict: null });
    expect(secondTask?.lastError).not.toMatch(/Reservation conflict/);
  });
});
