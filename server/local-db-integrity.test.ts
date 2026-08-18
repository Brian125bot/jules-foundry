import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("local database integrity guards", () => {
  const directories: string[] = [];

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
    delete process.env.FOUNDRY_DATA_DIR;
    delete process.env.FOUNDRY_DB_PATH;
    vi.resetModules();
  });

  it("reports healthy integrity and rejects child records without their task parent", async () => {
    const directory = await mkdtemp(join(tmpdir(), "jules-foundry-integrity-test-"));
    directories.push(directory);
    process.env.FOUNDRY_DATA_DIR = directory;
    process.env.FOUNDRY_DB_PATH = join(directory, "foundry.sqlite");
    vi.resetModules();
    const { getLocalClient, getLocalDatabaseIntegrity, closeLocalDb } = await import("./local-db");
    const client = await getLocalClient();
    await expect(client.execute("INSERT INTO task_events (eventId, taskId, source, eventType, summary, createdAt) VALUES ('orphan-event', 9999, 'local', 'test', 'must fail', 1)")).rejects.toThrow(/task event task does not exist/i);
    await expect(getLocalDatabaseIntegrity()).resolves.toMatchObject({ healthy: true, foreignKeysEnabled: true, orphans: { tasks: 0, initiatives: 0, taskEvents: 0 } });
    await closeLocalDb();
  });
});
