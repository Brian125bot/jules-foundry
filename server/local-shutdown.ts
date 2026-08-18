export type LocalShutdownDependencies = {
  stopMonitor: () => void;
  checkpointDatabase: () => Promise<unknown>;
  closeDatabase: () => Promise<unknown>;
  releaseInstanceLock: () => void;
  closeListener: () => void;
  warn?: (message: string) => void;
};

export function createLocalShutdownHandler(dependencies: LocalShutdownDependencies) {
  let shuttingDown = false;
  return async function shutdownLocalRuntime() {
    if (shuttingDown) return;
    shuttingDown = true;
    dependencies.stopMonitor();
    try { await dependencies.checkpointDatabase(); }
    catch (error) { dependencies.warn?.(`[Local database] WAL checkpoint could not complete during shutdown: ${error instanceof Error ? error.message : "unknown error"}`); }
    await dependencies.closeDatabase();
    dependencies.releaseInstanceLock();
    dependencies.closeListener();
  };
}
