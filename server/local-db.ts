import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import type { Client } from "@libsql/client";
import type { drizzle as DrizzleFactory } from "drizzle-orm/libsql";
import * as schema from "../drizzle/schema";
import { ensureLocalDirectories, LOCAL_BACKUP_DIR, LOCAL_DATA_DIR, LOCAL_DB_PATH } from "./local-runtime";

const MIGRATION_ID = "0000_open_khan";
const configuredMigrationPath = process.env.FOUNDRY_MIGRATION_PATH;
const migrationUrl = configuredMigrationPath ? null : new URL("../drizzle-local/0000_open_khan.sql", import.meta.url);
const nativeModuleRoot = process.env.FOUNDRY_NATIVE_MODULES_DIR;
const runtimeRequire = nativeModuleRoot ? createRequire(join(nativeModuleRoot, ".foundry-runtime.cjs")) : createRequire(import.meta.url);
const { createClient } = runtimeRequire("@libsql/client") as typeof import("@libsql/client");
const { drizzle: drizzleFactory } = runtimeRequire("drizzle-orm/libsql") as typeof import("drizzle-orm/libsql");
let client: Client | null = null;
let dbPromise: Promise<ReturnType<typeof DrizzleFactory<typeof schema>>> | null = null;

async function openClient() {
  if (client) return client;
  ensureLocalDirectories();
  client = createClient({ url: `file:${LOCAL_DB_PATH}`, timeout: 5_000, intMode: "number" });
  await client.execute("PRAGMA journal_mode=WAL");
  await client.execute("PRAGMA synchronous=FULL");
  await client.execute("PRAGMA foreign_keys=ON");
  await client.execute("PRAGMA busy_timeout=5000");
  return client;
}

async function applyMigrations(database: Client) {
  await database.execute("CREATE TABLE IF NOT EXISTS __foundry_local_migrations (id TEXT PRIMARY KEY NOT NULL, appliedAt INTEGER NOT NULL)");
  const existing = await database.execute({ sql: "SELECT id FROM __foundry_local_migrations WHERE id = ?", args: [MIGRATION_ID] });
  if (existing.rows.length) return;
  const migrationSource = configuredMigrationPath || migrationUrl;
  if (!migrationSource) throw new Error("No local SQLite migration path is available.");
  const source = (await readFile(migrationSource, "utf8")).replaceAll("--> statement-breakpoint", "");
  const transaction = await database.transaction("write");
  try {
    await transaction.executeMultiple(source);
    const now = new Date();
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    await transaction.execute({
      sql: "INSERT INTO users (id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (1, ?, ?, NULL, 'local', 'admin', ?, ?, ?)",
      args: ["local-operator", "Local operator", nowSeconds, nowSeconds, nowSeconds],
    });
    await transaction.execute({ sql: "INSERT INTO __foundry_local_migrations (id, appliedAt) VALUES (?, ?)", args: [MIGRATION_ID, now] });
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

async function normalizeSeededOperatorTimestamps(database: Client) {
  const millisecondEpochThreshold = 10_000_000_000;
  await database.execute({
    sql: "UPDATE users SET createdAt = createdAt / 1000, updatedAt = updatedAt / 1000, lastSignedIn = lastSignedIn / 1000 WHERE openId = ? AND (createdAt > ? OR updatedAt > ? OR lastSignedIn > ?)",
    args: ["local-operator", millisecondEpochThreshold, millisecondEpochThreshold, millisecondEpochThreshold],
  });
}

export async function getLocalDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await openClient();
      await applyMigrations(database);
      await normalizeSeededOperatorTimestamps(database);
      return drizzleFactory(database, { schema });
    })();
  }
  return dbPromise;
}

export async function getLocalClient() {
  await getLocalDb();
  if (!client) throw new Error("Local database client did not initialize.");
  return client;
}

export async function createLocalBackup() {
  const database = await getLocalClient();
  const filename = `foundry-${new Date().toISOString().replaceAll(":", "-")}.sqlite`;
  const destination = join(LOCAL_BACKUP_DIR, filename);
  const escaped = destination.replaceAll("'", "''");
  await database.execute(`VACUUM INTO '${escaped}'`);
  return { filename, path: destination };
}

export async function verifyLocalBackup(filename: string) {
  if (basename(filename) !== filename || !filename.endsWith(".sqlite")) throw new Error("Invalid backup filename.");
  const source = join(LOCAL_BACKUP_DIR, filename);
  const candidate = join(LOCAL_BACKUP_DIR, `${filename}.verify`);
  await copyFile(source, candidate);
  const verification = createClient({ url: `file:${candidate}` });
  try {
    const result = await verification.execute("PRAGMA integrity_check");
    return result.rows[0]?.integrity_check === "ok";
  } finally {
    verification.close();
    await rm(candidate, { force: true });
  }
}

export async function listLocalBackups() {
  ensureLocalDirectories();
  const entries = await readdir(LOCAL_BACKUP_DIR);
  const backups = await Promise.all(entries.filter(name => /^foundry-.*\.sqlite$/.test(name)).map(async filename => {
    const details = await stat(join(LOCAL_BACKUP_DIR, filename));
    return { filename, sizeBytes: details.size, createdAt: details.mtime.toISOString() };
  }));
  return backups.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function pruneLocalBackups(retain: number) {
  const backups = await listLocalBackups();
  const expired = backups.slice(retain);
  await Promise.all(expired.map(item => rm(join(LOCAL_BACKUP_DIR, item.filename), { force: true })));
  return { removed: expired.map(item => item.filename), retained: Math.min(backups.length, retain) };
}

/**
 * Stages a validated backup into a different, stopped runtime path. It refuses
 * to overwrite the active database; an operator must stop Foundry and perform
 * the final atomic replacement through the host operating system.
 */
export async function restoreLocalBackupToPath(filename: string, destinationPath: string) {
  if (basename(filename) !== filename || !filename.endsWith(".sqlite")) throw new Error("Invalid backup filename.");
  if (resolve(destinationPath) === resolve(LOCAL_DB_PATH)) throw new Error("Refusing to overwrite the active local database. Restore into a fresh stopped runtime path first.");
  const source = join(LOCAL_BACKUP_DIR, filename);
  await mkdir(dirname(destinationPath), { recursive: true, mode: 0o700 });
  await copyFile(source, destinationPath);
  const verification = createClient({ url: `file:${destinationPath}` });
  try {
    const result = await verification.execute("PRAGMA integrity_check");
    if (result.rows[0]?.integrity_check !== "ok") throw new Error("Staged local restore failed integrity verification.");
  } finally {
    verification.close();
  }
  return destinationPath;
}

export async function stageLocalRestore(filename: string) {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const destination = join(LOCAL_DATA_DIR, "restores", `${stamp}-${filename}`);
  await restoreLocalBackupToPath(filename, destination);
  return { stagedDatabasePath: destination, message: "Restore was integrity-checked and staged separately. Stop Foundry and promote it only after reviewing the staged copy." };
}

export async function checkpointLocalDb() {
  if (!client) return { checkpointed: false as const, reason: "database_not_open" as const };
  await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  return { checkpointed: true as const };
}

export async function closeLocalDb() {
  client?.close();
  client = null;
  dbPromise = null;
}
