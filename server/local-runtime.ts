import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import type { NextFunction, Request, Response } from "express";
import { parse } from "cookie";
import { COOKIE_NAME } from "../shared/const";

export const LOCAL_OPERATOR = {
  id: 1,
  openId: "local-operator",
  name: "Local operator",
  email: null,
  loginMethod: "local",
  role: "admin" as const,
};

function defaultDataDir() {
  const home = homedir();
  if (platform() === "darwin") return join(home, "Library", "Application Support", "JulesFoundry");
  if (platform() === "win32") return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "JulesFoundry");
  return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "jules-foundry");
}

export const LOCAL_DATA_DIR = resolve(process.env.FOUNDRY_DATA_DIR || defaultDataDir());
export const LOCAL_DB_PATH = process.env.FOUNDRY_DB_PATH || join(LOCAL_DATA_DIR, "foundry.sqlite");
export const LOCAL_ARTIFACT_DIR = join(LOCAL_DATA_DIR, "artifacts");
export const LOCAL_BACKUP_DIR = join(LOCAL_DATA_DIR, "backups");
export const LOCAL_LOG_DIR = join(LOCAL_DATA_DIR, "logs");

export function ensureLocalDirectories() {
  for (const directory of [LOCAL_DATA_DIR, LOCAL_ARTIFACT_DIR, LOCAL_BACKUP_DIR, LOCAL_LOG_DIR]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
}

const bootstrapToken = randomBytes(32).toString("base64url");
const sessionToken = randomBytes(32).toString("base64url");
let bootstrapConsumed = false;
let allowedPort: number | null = null;

function secureEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function configureLocalListener(port: number) {
  allowedPort = port;
}

export function localLaunchPath() {
  return `/local/bootstrap?bootstrap=${encodeURIComponent(bootstrapToken)}`;
}

export function openLocalBrowser(port: number) {
  if (process.env.FOUNDRY_OPEN_BROWSER === "false") return;
  const url = `http://127.0.0.1:${port}${localLaunchPath()}`;
  const command = platform() === "darwin" ? "open" : platform() === "win32" ? "cmd" : "xdg-open";
  const args = platform() === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(command, args, { detached: true, stdio: "ignore" }).unref(); } catch { /* A headless machine can still use its launch wrapper. */ }
}

export function isLoopbackRequest(req: Request) {
  const address = req.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function hasExpectedHost(req: Request) {
  if (!allowedPort) return false;
  const host = req.headers.host?.toLowerCase() || "";
  return host === `127.0.0.1:${allowedPort}` || host === `localhost:${allowedPort}` || host === `[::1]:${allowedPort}`;
}

function hasExpectedOrigin(req: Request) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.port === String(allowedPort) && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export function hasLocalSession(req: Request) {
  if (!isLoopbackRequest(req) || !hasExpectedHost(req)) return false;
  const received = parse(req.headers.cookie || "")[COOKIE_NAME];
  return typeof received === "string" && secureEqual(received, sessionToken);
}

export function requireLocalSession(req: Request, res: Response, next: NextFunction) {
  if (!hasLocalSession(req) || !hasExpectedOrigin(req)) {
    res.status(403).json({ error: "This Jules Foundry instance accepts only its current local browser session." });
    return;
  }
  next();
}

export function establishLocalSession(req: Request, res: Response) {
  const candidate = typeof req.query.bootstrap === "string" ? req.query.bootstrap : "";
  if (!isLoopbackRequest(req) || !hasExpectedHost(req) || bootstrapConsumed || !candidate || !secureEqual(candidate, bootstrapToken)) {
    res.status(403).send("Local bootstrap capability is missing, stale, or already consumed. Restart Jules Foundry to open a new local session.");
    return;
  }
  bootstrapConsumed = true;
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${sessionToken}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 12}`);
  res.redirect(303, "/");
}

export function clearLocalSession(res: Response) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
}

export function localRuntimeStatus() {
  return {
    mode: "trusted-machine-local-first" as const,
    dataDirectory: LOCAL_DATA_DIR,
    loopbackOnly: true,
    providerCallsServerSideOnly: true,
    monitoringRunsOnlyWhileApplicationIsRunning: true,
  };
}
