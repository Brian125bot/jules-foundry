import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("local SQLite persistence and vault", () => {
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
    delete process.env.FOUNDRY_DATA_DIR;
    delete process.env.FOUNDRY_DB_PATH;
    delete process.env.FOUNDRY_VAULT_PASSPHRASE;
    delete process.env.FOUNDRY_VAULT_MODE;
    vi.resetModules();
  });

  it("initializes the seeded local operator and produces an integrity-checked backup", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jules-foundry-local-test-"));
    const restoredDirectory = await mkdtemp(join(tmpdir(), "jules-foundry-restored-test-"));
    directories.push(directory);
    directories.push(restoredDirectory);
    process.env.FOUNDRY_DATA_DIR = directory;
    process.env.FOUNDRY_DB_PATH = join(directory, "foundry.sqlite");
    vi.resetModules();
    const { getLocalClient, getLocalDb, checkpointLocalDb, createLocalBackup, listLocalBackups, pruneLocalBackups, stageLocalRestore, verifyLocalBackup, restoreLocalBackupToPath, closeLocalDb } = await import("./local-db");
    const { storageGet, storagePut } = await import("./local-storage");
    const { initiatives, sessionMonitorCheckpoints, tasks, users } = await import("../drizzle/schema");
    const db = await getLocalDb();
    const operators = await db.select().from(users);
    expect(operators).toEqual([expect.objectContaining({ id: 1, openId: "local-operator", role: "admin" })]);
    expect(operators[0]?.createdAt.getUTCFullYear()).toBe(new Date().getUTCFullYear());
    const integrity = await (await getLocalClient()).execute("PRAGMA integrity_check");
    expect(integrity.rows[0]?.integrity_check).toBe("ok");
    const backup = await createLocalBackup();
    expect(await verifyLocalBackup(backup.filename)).toBe(true);
    expect(await listLocalBackups()).toEqual([expect.objectContaining({ filename: backup.filename, sizeBytes: expect.any(Number) })]);
    expect(await pruneLocalBackups(1)).toMatchObject({ removed: [], retained: 1 });
    await expect(stageLocalRestore(backup.filename)).resolves.toMatchObject({ stagedDatabasePath: expect.stringContaining("restores"), message: expect.stringContaining("staged") });
    await expect(storagePut("../../escape.txt", "not allowed")).rejects.toThrow(/escapes local storage/i);
    await expect(storagePut("evidence/task-1.txt", "bounded local evidence")).resolves.toMatchObject({ url: "/local-artifacts/evidence/task-1.txt" });
    await expect(storageGet("evidence/task-1.txt")).resolves.toMatchObject({ key: "evidence/task-1.txt" });
    const initiativeId = Number((await db.insert(initiatives).values({ userId: 1, title: "Restart recovery", prompt: "Recover monitoring from a stored checkpoint", repository: "owner/repository", branch: "main", budgetCents: 100 })).lastInsertRowid);
    const taskId = Number((await db.insert(tasks).values({ initiativeId, taskKey: "restart-recovery-task", title: "Recover checkpoint", description: "A persisted checkpoint must be selected after local restart.", riskTier: "green", allowedPaths: "[\"README.md\"]", nonGoals: "[]", acceptanceCriteria: "[]", dependencies: "[]", idempotencyKey: "restart-recovery-task", state: "executing", julesSessionName: "sessions/restart-recovery" })).lastInsertRowid);
    await db.insert(sessionMonitorCheckpoints).values({ taskId, julesSessionName: "sessions/restart-recovery", observedState: "IN_PROGRESS", nextRecommendedPollAt: new Date("2026-08-18T00:00:00.000Z"), monitorVersion: "session-monitor-v1" });
    await expect(checkpointLocalDb()).resolves.toEqual({ checkpointed: true });
    const recoveryBackup = await createLocalBackup();
    const restoredPath = join(restoredDirectory, "foundry.sqlite");
    await expect(restoreLocalBackupToPath(recoveryBackup.filename, restoredPath)).resolves.toBe(restoredPath);
    await closeLocalDb();
    process.env.FOUNDRY_DATA_DIR = restoredDirectory;
    process.env.FOUNDRY_DB_PATH = restoredPath;
    vi.resetModules();
    const { getLocalDb: getRestoredDb, closeLocalDb: closeRestoredDb } = await import("./local-db");
    const { tasks: restoredTasks, users: restoredUsers } = await import("../drizzle/schema");
    const restoredDb = await getRestoredDb();
    expect(await restoredDb.select().from(restoredUsers)).toEqual([expect.objectContaining({ id: 1, openId: "local-operator" })]);
    expect((await restoredDb.select().from(restoredTasks).where((await import("drizzle-orm")).eq(restoredTasks.id, taskId)).limit(1))[0]).toMatchObject({ julesSessionName: "sessions/restart-recovery", state: "executing" });
    const { dueLocalTaskIds } = await import("./services/local-monitor");
    expect(await dueLocalTaskIds(new Date("2026-08-18T00:01:00.000Z"))).toContain(taskId);
    await closeRestoredDb();
  });

  it("encrypts local provider secrets with a startup passphrase and never returns plaintext from ciphertext", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jules-foundry-vault-test-"));
    directories.push(directory);
    process.env.FOUNDRY_DATA_DIR = directory;
    process.env.FOUNDRY_VAULT_PASSPHRASE = "test-only-local-passphrase";
    process.env.FOUNDRY_VAULT_MODE = "passphrase";
    vi.resetModules();
    const { decryptSecret, encryptSecret, isCurrentVaultCiphertext, maskSecret } = await import("./services/vault");
    const secret = "github_pat_local_secret";
    const ciphertext = encryptSecret(secret);
    expect(isCurrentVaultCiphertext(ciphertext)).toBe(true);
    expect(ciphertext).not.toContain(secret);
    expect(decryptSecret(ciphertext)).toBe(secret);
    expect(maskSecret(secret)).toBe("••••••••cret");
  });

  it("reports a ready local preflight and a stable single-instance lock path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jules-foundry-preflight-test-"));
    directories.push(directory);
    process.env.FOUNDRY_DATA_DIR = directory;
    vi.resetModules();
    const { localRuntimeStatus, runLocalPreflight } = await import("./local-runtime");
    const preflight = await runLocalPreflight();
    expect(preflight.ready).toBe(true);
    expect(localRuntimeStatus().singleInstanceLock).toContain("foundry.instance.lock");
  });

  it("refuses a second local instance for the same data directory and releases its owner lock safely", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jules-foundry-lock-test-"));
    directories.push(directory);
    process.env.FOUNDRY_DATA_DIR = directory;
    vi.resetModules();
    const { acquireLocalInstanceLock, releaseLocalInstanceLock, LOCAL_LOCK_PATH } = await import("./local-runtime");
    expect(acquireLocalInstanceLock()).toMatchObject({ acquired: true, recoveredStaleLock: false });
    expect(existsSync(LOCAL_LOCK_PATH)).toBe(true);
    expect(() => acquireLocalInstanceLock()).toThrow(/already running/i);
    releaseLocalInstanceLock();
    expect(existsSync(LOCAL_LOCK_PATH)).toBe(false);
  });

  it("persists local first-run onboarding completion without hosted state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jules-foundry-onboarding-test-"));
    directories.push(directory);
    process.env.FOUNDRY_DATA_DIR = directory;
    vi.resetModules();
    const { getLocalSettings, updateLocalSettings } = await import("./local-settings");
    expect(getLocalSettings().onboardingCompleted).toBe(false);
    expect(updateLocalSettings({ onboardingCompleted: true })).toMatchObject({ onboardingCompleted: true });
    expect(getLocalSettings().onboardingCompleted).toBe(true);
  });
});
