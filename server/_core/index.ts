import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { getLocalDb } from "../local-db";
import { configureLocalListener, establishLocalSession, openLocalBrowser } from "../local-runtime";
import { registerLocalStorageRoutes } from "../local-storage";
import { startLocalMonitor, stopLocalMonitor } from "../services/local-monitor";

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
  await getLocalDb();
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
  if (process.env.NODE_ENV === "development") await setupVite(app, server);
  else serveStatic(app);

  const port = await findAvailablePort(Number.parseInt(process.env.FOUNDRY_PORT || "31415", 10));
  configureLocalListener(port);
  server.listen(port, "127.0.0.1", () => {
    console.log(`Jules Foundry local runtime is ready on 127.0.0.1:${port}. A one-time local browser session is opening.`);
    openLocalBrowser(port);
    startLocalMonitor();
  });
  const shutdown = () => { stopLocalMonitor(); server.close(); };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

startServer().catch(error => { console.error("Jules Foundry local startup failed", error); process.exitCode = 1; });
