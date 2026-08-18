import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), isAxiosError: vi.fn(() => false) } }));

import axios from "axios";
import { eq } from "drizzle-orm";
import { credentialProfiles, initiatives, sessionControls, sessionMonitorCheckpoints, taskAttempts, taskControlLeases, taskEvents, tasks } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const userId = 987654329;
const getMock = vi.mocked(axios.get);
const deleteMock = vi.mocked(axios.delete);

function context(): TrpcContext {
  return {
    user: { id: userId, openId: "session-control-router-user", name: "Session-control router user", email: null, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

async function createActiveTask() {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable for test");
  const initiativeId = Number((await db.insert(initiatives).values({ userId, title: "Session control test", prompt: "Exercise guarded controls", repository: "acme/test", branch: "main", budgetCents: 100 }))[0].insertId);
  const taskId = Number((await db.insert(tasks).values({ initiativeId, taskKey: `session-control-${Date.now()}`, title: "Guarded session control", description: "Ensure session controls are durable and operator-governed.", riskTier: "green", allowedPaths: JSON.stringify(["README.md"]), nonGoals: JSON.stringify(["Do not alter production resources."]), acceptanceCriteria: JSON.stringify([{ id: "AC-1", text: "Controls remain safe and auditable." }]), dependencies: JSON.stringify([]), idempotencyKey: `session-control-${Date.now()}`, state: "executing", health: "healthy", julesSessionName: "sessions/test-guarded", julesSessionId: "test-guarded", julesState: "IN_PROGRESS" }))[0].insertId);
  return { db, taskId };
}

afterEach(async () => {
  getMock.mockReset(); deleteMock.mockReset();
  const db = await getDb();
  if (!db) return;
  const taskRows = await db.select({ id: tasks.id }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(eq(initiatives.userId, userId));
  for (const task of taskRows) {
    await db.delete(taskEvents).where(eq(taskEvents.taskId, task.id));
    await db.delete(taskAttempts).where(eq(taskAttempts.taskId, task.id));
    await db.delete(sessionControls).where(eq(sessionControls.taskId, task.id));
    await db.delete(taskControlLeases).where(eq(taskControlLeases.taskId, task.id));
    await db.delete(sessionMonitorCheckpoints).where(eq(sessionMonitorCheckpoints.taskId, task.id));
    await db.delete(tasks).where(eq(tasks.id, task.id));
  }
  await db.delete(initiatives).where(eq(initiatives.userId, userId));
  await db.delete(credentialProfiles).where(eq(credentialProfiles.userId, userId));
});

describe("session-control router safeguards", () => {
  it("persists a Foundry-only hold once, emits an audit event, and reuses an identical command", async () => {
    const { db, taskId } = await createActiveTask();
    const caller = appRouter.createCaller(context());
    const first = await caller.foundry.session.command({ taskId, type: "set_local_hold", reason: "Operator reviewing evidence" });
    const repeated = await caller.foundry.session.command({ taskId, type: "set_local_hold", reason: "Operator reviewing evidence" });

    expect(first).toMatchObject({ reused: false, success: true });
    expect(repeated).toMatchObject({ reused: true });
    const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    const controls = await db.select().from(sessionControls).where(eq(sessionControls.taskId, taskId));
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));
    const leases = await db.select().from(taskControlLeases).where(eq(taskControlLeases.taskId, taskId));
    expect(task).toMatchObject({ localHold: 1, localHoldReason: "Operator reviewing evidence" });
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ controlType: "set_local_hold", status: "succeeded" });
    expect(events.filter(event => event.eventType === "local_hold_set")).toHaveLength(1);
    expect(leases).toHaveLength(0);
  });

  it("requires the exact session name before it creates a provider-deletion command", async () => {
    const { db, taskId } = await createActiveTask();
    const caller = appRouter.createCaller(context());
    await expect(caller.foundry.session.command({ taskId, type: "request_delete", confirmation: "sessions/wrong" })).rejects.toThrow(/Type the exact Jules session name/i);
    expect(deleteMock).not.toHaveBeenCalled();
    expect(await db.select().from(sessionControls).where(eq(sessionControls.taskId, taskId))).toHaveLength(0);
  });

  it("fails closed when the provider state changes after a typed delete confirmation", async () => {
    const { db, taskId } = await createActiveTask();
    const caller = appRouter.createCaller(context());
    await caller.foundry.credentials.save({ provider: "jules", label: "session-control-jules", secret: "session-control-jules-key" });
    getMock.mockResolvedValue({ data: { name: "sessions/test-guarded", state: "COMPLETED", activities: [] } } as never);

    await expect(caller.foundry.session.command({ taskId, type: "request_delete", confirmation: "sessions/test-guarded" })).rejects.toThrow(/Provider state changed during delete confirmation/i);
    expect(deleteMock).not.toHaveBeenCalled();
    const controls = await db.select().from(sessionControls).where(eq(sessionControls.taskId, taskId));
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({ controlType: "request_delete", status: "failed" });
    expect(controls[0]?.preconditionSnapshot).toContain("IN_PROGRESS");
  });

  it("persists a restart-safe success checkpoint and avoids duplicating an already-seen provider activity", async () => {
    const { db, taskId } = await createActiveTask();
    const caller = appRouter.createCaller(context());
    await caller.foundry.credentials.save({ provider: "jules", label: "monitor-success-jules", secret: "monitor-success-jules-key" });
    await db.insert(taskEvents).values({ taskId, eventId: "existing-activity-event", source: "jules", eventType: "progress_updated", summary: "Existing provider event", providerActivityId: "activities/seen", correlationId: "existing-correlation" });
    getMock.mockImplementation(async url => {
      if (String(url).endsWith("/activities")) return { data: { activities: [{ id: "activities/seen", createTime: "2026-08-18T00:00:00Z", description: "Already seen", progressUpdated: {} }, { id: "activities/new", createTime: "2026-08-18T00:01:00Z", description: "New progress", progressUpdated: {} }] } } as never;
      return { data: { name: "sessions/test-guarded", state: "IN_PROGRESS", updateTime: "2026-08-18T00:01:00Z", outputs: [] } } as never;
    });

    await expect(caller.foundry.observatory.poll({ taskId })).resolves.toMatchObject({ reused: false, health: "stale" });
    const checkpoint = (await db.select().from(sessionMonitorCheckpoints).where(eq(sessionMonitorCheckpoints.taskId, taskId)).limit(1))[0];
    const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId));
    expect(checkpoint).toMatchObject({ lastActivityId: "activities/new", observedState: "IN_PROGRESS", errorStreak: 0, lastError: null });
    expect(checkpoint?.nextRecommendedPollAt).not.toBeNull();
    expect(events.filter(event => event.providerActivityId === "activities/seen")).toHaveLength(1);
    expect(events.filter(event => event.providerActivityId === "activities/new")).toHaveLength(1);
  });

  it("records monitor failure state and bounded retry metadata without losing the task audit trail", async () => {
    const { db, taskId } = await createActiveTask();
    const caller = appRouter.createCaller(context());
    await caller.foundry.credentials.save({ provider: "jules", label: "monitor-failure-jules", secret: "monitor-failure-jules-key" });
    getMock.mockRejectedValue(new Error("provider temporarily unavailable"));

    await expect(caller.foundry.observatory.poll({ taskId })).rejects.toThrow(/provider temporarily unavailable/i);
    const task = (await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1))[0];
    const checkpoint = (await db.select().from(sessionMonitorCheckpoints).where(eq(sessionMonitorCheckpoints.taskId, taskId)).limit(1))[0];
    const attempts = await db.select().from(taskAttempts).where(eq(taskAttempts.taskId, taskId));
    expect(task).toMatchObject({ health: "attention", lastError: "provider temporarily unavailable" });
    expect(checkpoint).toMatchObject({ observedState: "IN_PROGRESS", errorStreak: 1, lastError: "provider temporarily unavailable" });
    expect(checkpoint?.nextRecommendedPollAt).not.toBeNull();
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({ attemptType: "poll", outcome: "failure" });
  });
});
