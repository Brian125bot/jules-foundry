import { and, desc, eq, inArray } from "drizzle-orm";
import {
  credentialProfiles,
  initiatives,
  type InsertUser,
  sessionControls,
  sessionMonitorCheckpoints,
  taskApprovals,
  taskAttempts,
  taskEvidence,
  taskEvents,
  tasks,
  users,
} from "../drizzle/schema";
import { getLocalDb } from "./local-db";

export async function getDb() {
  return getLocalDb();
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  const now = new Date();
  await db.insert(users).values({
    ...user,
    name: user.name ?? null,
    email: user.email ?? null,
    loginMethod: user.loginMethod ?? "local",
    role: user.role ?? "admin",
    lastSignedIn: user.lastSignedIn ?? now,
  }).onConflictDoUpdate({
    target: users.openId,
    set: { name: user.name ?? null, email: user.email ?? null, loginMethod: user.loginMethod ?? "local", lastSignedIn: user.lastSignedIn ?? now, updatedAt: now },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export function requireDb<T>(db: T | null | undefined): T {
  if (!db) throw new Error("The local Jules Foundry database is not available.");
  return db;
}

export async function getCredentialProfiles(userId: number) {
  const db = await getDb();
  const profiles = await db.select().from(credentialProfiles).where(eq(credentialProfiles.userId, userId)).orderBy(desc(credentialProfiles.updatedAt));
  return profiles.map(({ encryptedSecret: _encryptedSecret, ...profile }) => profile);
}

export async function getCredentialSecret(userId: number, provider: "jules" | "gemini" | "github") {
  const db = await getDb();
  return (await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.userId, userId), eq(credentialProfiles.provider, provider))).orderBy(desc(credentialProfiles.updatedAt)).limit(1))[0];
}

export async function getCredentialById(userId: number, credentialId: number) {
  const db = await getDb();
  return (await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.id, credentialId), eq(credentialProfiles.userId, userId))).limit(1))[0];
}

export async function getInitiativeForUser(userId: number, initiativeId: number) {
  const db = await getDb();
  return (await db.select().from(initiatives).where(and(eq(initiatives.userId, userId), eq(initiatives.id, initiativeId))).limit(1))[0];
}

export async function getTaskForUser(userId: number, taskId: number) {
  const db = await getDb();
  return (await db.select({ task: tasks, initiative: initiatives }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(and(eq(tasks.id, taskId), eq(initiatives.userId, userId))).limit(1))[0];
}

export async function getTaskTimeline(taskId: number) {
  const db = await getDb();
  const [events, attempts, evidence, approvals, controls, checkpoint] = await Promise.all([
    db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId)).orderBy(desc(taskEvents.createdAt)),
    db.select().from(taskAttempts).where(eq(taskAttempts.taskId, taskId)).orderBy(desc(taskAttempts.createdAt)),
    db.select().from(taskEvidence).where(eq(taskEvidence.taskId, taskId)).orderBy(desc(taskEvidence.createdAt)),
    db.select().from(taskApprovals).where(eq(taskApprovals.taskId, taskId)).orderBy(desc(taskApprovals.createdAt)),
    db.select().from(sessionControls).where(eq(sessionControls.taskId, taskId)).orderBy(desc(sessionControls.createdAt)),
    db.select().from(sessionMonitorCheckpoints).where(eq(sessionMonitorCheckpoints.taskId, taskId)).limit(1),
  ]);
  return { events, attempts, evidence, approvals, controls, checkpoint: checkpoint[0] ?? null };
}

export async function getTaskEventsByTaskIds(taskIds: number[]) {
  if (!taskIds.length) return [];
  const db = await getDb();
  return db.select().from(taskEvents).where(inArray(taskEvents.taskId, taskIds)).orderBy(desc(taskEvents.createdAt));
}
