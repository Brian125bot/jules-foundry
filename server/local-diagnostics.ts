import { readdir, statfs } from "node:fs/promises";
import os from "node:os";
import { getLocalClient, getLocalDatabaseIntegrity } from "./local-db";
import { LOCAL_ARTIFACT_DIR, LOCAL_BACKUP_DIR, LOCAL_DATA_DIR, localRuntimeStatus, runLocalPreflight } from "./local-runtime";
import { getVaultKeyStatus } from "./services/vault-key-provider";

async function countEntries(path: string) {
  try { return (await readdir(path)).length; } catch { return 0; }
}

export async function getLocalDiagnostics() {
  const [preflight, backups, artifacts, client, databaseIntegrity] = await Promise.all([runLocalPreflight(), countEntries(LOCAL_BACKUP_DIR), countEntries(LOCAL_ARTIFACT_DIR), getLocalClient(), getLocalDatabaseIntegrity()]);
  const migration = await client.execute("SELECT id, appliedAt FROM __foundry_local_migrations ORDER BY appliedAt DESC LIMIT 1");
  const disk = await statfs(LOCAL_DATA_DIR);
  return {
    runtime: localRuntimeStatus(),
    preflight,
    vault: getVaultKeyStatus(),
    storage: { backupCount: backups, artifactCount: artifacts, availableBytes: Number(disk.bavail) * Number(disk.bsize) },
    databaseIntegrity,
    migration: migration.rows[0] ?? null,
    platform: { os: os.platform(), arch: os.arch(), release: os.release(), node: process.version },
    generatedAt: new Date().toISOString(),
  };
}
