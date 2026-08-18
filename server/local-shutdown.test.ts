import { describe, expect, it, vi } from "vitest";
import { createLocalShutdownHandler } from "./local-shutdown";

describe("local runtime shutdown", () => {
  it("finalizes monitoring, checkpoints SQLite, closes resources, and releases the lock once", async () => {
    const order: string[] = [];
    const shutdown = createLocalShutdownHandler({
      stopMonitor: () => order.push("monitor"),
      checkpointDatabase: async () => { order.push("checkpoint"); },
      closeDatabase: async () => { order.push("database"); },
      releaseInstanceLock: () => order.push("lock"),
      closeListener: () => order.push("listener"),
    });
    await shutdown();
    await shutdown();
    expect(order).toEqual(["monitor", "checkpoint", "database", "lock", "listener"]);
  });

  it("still closes the runtime safely when the WAL checkpoint cannot finish", async () => {
    const warn = vi.fn();
    const closeDatabase = vi.fn(async () => undefined);
    const releaseInstanceLock = vi.fn();
    const closeListener = vi.fn();
    const shutdown = createLocalShutdownHandler({
      stopMonitor: vi.fn(),
      checkpointDatabase: async () => { throw new Error("I/O failure"); },
      closeDatabase,
      releaseInstanceLock,
      closeListener,
      warn,
    });
    await shutdown();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("I/O failure"));
    expect(closeDatabase).toHaveBeenCalledOnce();
    expect(releaseInstanceLock).toHaveBeenCalledOnce();
    expect(closeListener).toHaveBeenCalledOnce();
  });
});
