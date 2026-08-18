import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../drizzle/schema";
import { ensureLocalDirectories, LOCAL_BACKUP_DIR, LOCAL_DB_PATH } from "./local-runtime";

const MIGRATION_ID = "0000_open_khan";
const migrationUrl = new URL("../drizzle-local/0000_open_khan.sql", import.meta.url);
let client: Client | null = null;
let dbPromise: Promise<ReturnType<typeof drizzle<typeof schema>>> | null = null;

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
  const source = (await readFile(migrationUrl, "utf8")).replaceAll("--> statement-breakpoint", "");
  const transaction = await database.transaction("write");
  try {
    await transaction.executeMultiple(source);
    const now = new Date();
    await transaction.execute({
      sql: "INSERT INTO users (id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (1, ?, ?, NULL, 'local', 'admin', ?, ?, ?)",
      args: ["local-operator", "Local operator", now, now, now],
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

export async function getLocalDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await openClient();
      await applyMigrations(database);
      return drizzle(database, { schema });
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

export async function closeLocalDb() {
  client?.close();
  client = null;
  dbPromise = null;
}
