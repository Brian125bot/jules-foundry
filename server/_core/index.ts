import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveLocalStatic } from "./static";
import { checkpointLocalDb, closeLocalDb, getLocalDb } from "../local-db";
import { acquireLocalInstanceLock, configureLocalListener, establishLocalSession, localLaunchPath, openLocalBrowser, releaseLocalInstanceLock, runLocalPreflight } from "../local-runtime";
import { registerLocalStorageRoutes } from "../local-storage";
import { startLocalMonitor, stopLocalMonitor } from "../services/local-monitor";
import { migrateLegacyVaultCiphertexts } from "../services/vault-migration";
import { createLocalShutdownHandler } from "../local-shutdown";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen({ port, host: "127.0.0.1" }, () => server.close(() => resolve(true)));
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort = 31415): Promise<number> {
  for (let port = startPort; port < startPort + 100; port += 1) if (await isPortAvailable(port)) return port;
  throw new Error(`No loopback port is available in the range beginning at ${startPort}.`);
}

async function startServer() {
  const lock = acquireLocalInstanceLock();
  const preflight = await runLocalPreflight();
  if (!preflight.ready) throw new Error(`Jules Foundry requires at least ${preflight.minimumFreeBytes} bytes of free local storage before startup.`);
  await getLocalDb();
  await migrateLegacyVaultCiphertexts().catch(error => { console.warn("[Vault] Legacy ciphertext migration deferred:", error instanceof Error ? error.message : "unknown error"); });
  const app = express();
  const server = createServer(app);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    next();
  });
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));
  app.get("/local/bootstrap", establishLocalSession);
  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  registerLocalStorageRoutes(app);
  if (process.env.NODE_ENV === "development" && !process.env.FOUNDRY_STATIC_DIR) {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else serveLocalStatic(app);

  const port = await findAvailablePort(Number.parseInt(process.env.FOUNDRY_PORT || "31415", 10));
  configureLocalListener(port);
  server.listen(port, "127.0.0.1", () => {
    const launchUrl = `http://127.0.0.1:${port}${localLaunchPath()}`;
    if (process.env.FOUNDRY_OPEN_BROWSER === "false") console.log(`Jules Foundry local runtime is ready. Open this one-time local session URL in a trusted browser: ${launchUrl}`);
    else {
      console.log(`Jules Foundry local runtime is ready on 127.0.0.1:${port}. A one-time local browser session is opening.`);
      openLocalBrowser(port);
    }
    startLocalMonitor();
  });
  const shutdown = createLocalShutdownHandler({
    stopMonitor: stopLocalMonitor,
    checkpointDatabase: checkpointLocalDb,
    closeDatabase: closeLocalDb,
    releaseInstanceLock: releaseLocalInstanceLock,
    closeListener: () => server.close(),
    warn: message => console.warn(message),
  });
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
}

startServer().catch(error => { releaseLocalInstanceLock(); console.error("Jules Foundry local startup failed", error); process.exitCode = 1; });
