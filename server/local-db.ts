import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import type { Client } from "@libsql/client";
import type { drizzle as DrizzleFactory } from "drizzle-orm/libsql";
import * as schema from "../drizzle/schema";
import { ensureLocalDirectories, LOCAL_BACKUP_DIR, LOCAL_DATA_DIR, LOCAL_DB_PATH } from "./local-runtime";

const configuredMigrationPath = process.env.FOUNDRY_MIGRATION_PATH;
const nativeModuleRoot = process.env.FOUNDRY_NATIVE_MODULES_DIR;
const runtimeRequire = nativeModuleRoot ? createRequire(join(nativeModuleRoot, ".foundry-runtime.cjs")) : createRequire(join(process.cwd(), "package.json"));
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
  const migrationDirectory = configuredMigrationPath ? dirname(configuredMigrationPath) : join(process.cwd(), "drizzle-local");
  const migrations = [
    { id: "0000_open_khan", file: configuredMigrationPath || join(migrationDirectory, "0000_open_khan.sql"), seedsLocalOperator: true },
    { id: "0001_integrity_guards", file: join(migrationDirectory, "0001_integrity_guards.sql"), seedsLocalOperator: false },
    { id: "0002_relax_operator_fixture_guards", file: join(migrationDirectory, "0002_relax_operator_fixture_guards.sql"), seedsLocalOperator: false },
  ];
  for (const migration of migrations) {
    const existing = await database.execute({ sql: "SELECT id FROM __foundry_local_migrations WHERE id = ?", args: [migration.id] });
    if (existing.rows.length) continue;
    if (migration.id === "0001_integrity_guards") {
      const integrity = await getLocalDatabaseIntegrity(database);
      if (!integrity.healthy) throw new Error(`Refusing to install integrity guards while local data has integrity failures: ${integrity.failures.join("; ")}`);
    }
    const source = (await readFile(migration.file, "utf8")).replaceAll("--> statement-breakpoint", "");
    const transaction = await database.transaction("write");
    try {
      await transaction.executeMultiple(source);
      const now = new Date();
      if (migration.seedsLocalOperator) {
        const nowSeconds = Math.floor(now.getTime() / 1_000);
        await transaction.execute({
          sql: "INSERT INTO users (id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES (1, ?, ?, NULL, 'local', 'admin', ?, ?, ?)",
          args: ["local-operator", "Local operator", nowSeconds, nowSeconds, nowSeconds],
        });
      }
      await transaction.execute({ sql: "INSERT INTO __foundry_local_migrations (id, appliedAt) VALUES (?, ?)", args: [migration.id, now] });
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    } finally {
      transaction.close();
    }
  }
}

export async function getLocalDatabaseIntegrity(database?: Client) {
  const activeClient = database || await getLocalClient();
  const [integrityCheck, foreignKeyState, orphanedTasks, orphanedInitiatives, orphanedEvents] = await Promise.all([
    activeClient.execute("PRAGMA integrity_check"),
    activeClient.execute("PRAGMA foreign_keys"),
    activeClient.execute("SELECT COUNT(*) AS count FROM tasks LEFT JOIN initiatives ON initiatives.id = tasks.initiativeId WHERE initiatives.id IS NULL"),
    activeClient.execute("SELECT COUNT(*) AS count FROM initiatives LEFT JOIN users ON users.id = initiatives.userId WHERE users.id IS NULL"),
    activeClient.execute("SELECT COUNT(*) AS count FROM task_events LEFT JOIN tasks ON tasks.id = task_events.taskId WHERE tasks.id IS NULL"),
  ]);
  const orphans = {
    tasks: Number(orphanedTasks.rows[0]?.count ?? 0),
    initiatives: Number(orphanedInitiatives.rows[0]?.count ?? 0),
    taskEvents: Number(orphanedEvents.rows[0]?.count ?? 0),
  };
  const failures = [
    ...(integrityCheck.rows[0]?.integrity_check === "ok" ? [] : ["SQLite integrity_check did not return ok"]),
    ...(Number(foreignKeyState.rows[0]?.foreign_keys ?? 0) === 1 ? [] : ["SQLite foreign-key enforcement is disabled"]),
    ...Object.entries(orphans).filter(([, value]) => value > 0).map(([table, value]) => `${value} orphaned ${table}`),
  ];
  return { healthy: failures.length === 0, sqliteIntegrity: integrityCheck.rows[0]?.integrity_check === "ok", foreignKeysEnabled: Number(foreignKeyState.rows[0]?.foreign_keys ?? 0) === 1, orphans, failures };
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
