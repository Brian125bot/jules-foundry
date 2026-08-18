import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  credentialProfiles,
  initiatives,
  InsertUser,
  sessionControls,
  sessionMonitorCheckpoints,
  taskApprovals,
  taskAttempts,
  taskEvidence,
  taskEvents,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId, name: user.name, email: user.email, loginMethod: user.loginMethod, lastSignedIn: user.lastSignedIn ?? new Date() };
  const role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  await db.insert(users).values({ ...values, role }).onDuplicateKeyUpdate({ set: { name: values.name, email: values.email, loginMethod: values.loginMethod, lastSignedIn: values.lastSignedIn } });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select().from(users).where(eq(users.openId, openId)).limit(1))[0];
}

export function requireDb<T>(db: T | null): T {
  if (!db) throw new Error("The Foundry database is not available.");
  return db;
}

export async function getCredentialProfiles(userId: number) {
  const db = requireDb(await getDb());
  const profiles = await db.select().from(credentialProfiles).where(eq(credentialProfiles.userId, userId)).orderBy(desc(credentialProfiles.updatedAt));
  return profiles.map(({ encryptedSecret: _encryptedSecret, ...profile }) => profile);
}

export async function getCredentialSecret(userId: number, provider: "jules" | "gemini" | "github") {
  const db = requireDb(await getDb());
  return (await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.userId, userId), eq(credentialProfiles.provider, provider))).orderBy(desc(credentialProfiles.updatedAt)).limit(1))[0];
}

export async function getCredentialById(userId: number, credentialId: number) {
  const db = requireDb(await getDb());
  return (await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.id, credentialId), eq(credentialProfiles.userId, userId))).limit(1))[0];
}

export async function getInitiativeForUser(userId: number, initiativeId: number) {
  const db = requireDb(await getDb());
  return (await db.select().from(initiatives).where(and(eq(initiatives.userId, userId), eq(initiatives.id, initiativeId))).limit(1))[0];
}

export async function getTaskForUser(userId: number, taskId: number) {
  const db = requireDb(await getDb());
  const result = await db.select({ task: tasks, initiative: initiatives }).from(tasks).innerJoin(initiatives, eq(tasks.initiativeId, initiatives.id)).where(and(eq(tasks.id, taskId), eq(initiatives.userId, userId))).limit(1);
  return result[0];
}

export async function getTaskTimeline(taskId: number) {
  const db = requireDb(await getDb());
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
  const db = requireDb(await getDb());
  if (!taskIds.length) return [];
  return db.select().from(taskEvents).where(inArray(taskEvents.taskId, taskIds)).orderBy(desc(taskEvents.createdAt));
}
