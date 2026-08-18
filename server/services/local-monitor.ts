import { and, eq, inArray } from "drizzle-orm";
import { initiatives, sessionMonitorCheckpoints, tasks } from "../../drizzle/schema";
import { getDb } from "../db";
import { pollOne } from "../routers/foundry";

let timer: NodeJS.Timeout | null = null;
let running = false;

export function shouldPollCheckpoint(checkpoint: { nextRecommendedPollAt?: Date | null } | null, now = new Date()) {
  return !checkpoint?.nextRecommendedPollAt || checkpoint.nextRecommendedPollAt.getTime() <= now.getTime();
}

export async function dueLocalTaskIds(now = new Date()) {
  const db = await getDb();
  const active = await db.select({ id: tasks.id }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(and(eq(initiatives.userId, 1), inArray(tasks.state, ["dispatched", "plan_gate", "executing", "blocked"])));
  const checkpoints = active.length ? await db.select().from(sessionMonitorCheckpoints).where(inArray(sessionMonitorCheckpoints.taskId, active.map(task => task.id))) : [];
  const byTask = new Map(checkpoints.map(checkpoint => [checkpoint.taskId, checkpoint]));
  return active.filter(task => shouldPollCheckpoint(byTask.get(task.id) ?? null, now)).map(task => task.id);
}

async function cycle() {
  if (running) return;
  running = true;
  try {
    for (const taskId of await dueLocalTaskIds()) await pollOne(1, taskId).catch(() => undefined);
  } finally {
    running = false;
    timer = setTimeout(() => void cycle(), 5_000);
    timer.unref();
  }
}

export function startLocalMonitor() {
  if (!timer) void cycle();
}

export function stopLocalMonitor() {
  if (timer) clearTimeout(timer);
  timer = null;
}
