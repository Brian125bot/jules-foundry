import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLocalSession, configureLocalListener, establishLocalSession, hasLocalSession, localLaunchPath, requireLocalSession } from "./local-runtime";
import { shouldPollCheckpoint } from "./services/local-monitor";

describe("trusted-machine local runtime", () => {
  afterEach(() => vi.restoreAllMocks());

  it("rejects a request that lacks the in-memory local session", () => {
    const status = vi.fn();
    const json = vi.fn();
    const next = vi.fn();
    status.mockReturnValue({ json });
    requireLocalSession({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:31415" } } as any, { status } as any, next);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining("local browser session") }));
    expect(next).not.toHaveBeenCalled();
  });

  it("exchanges a one-time loopback bootstrap capability for an HttpOnly local session", () => {
    configureLocalListener(31415);
    const bootstrap = new URL(`http://127.0.0.1:31415${localLaunchPath()}`).searchParams.get("bootstrap");
    const headers = new Map<string, string>();
    const redirect = vi.fn();
    establishLocalSession({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:31415" }, query: { bootstrap } } as any, { setHeader: (name: string, value: string) => headers.set(name, value), redirect } as any);
    const sessionCookie = headers.get("Set-Cookie");
    expect(redirect).toHaveBeenCalledWith(303, "/");
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("SameSite=Strict");
    expect(hasLocalSession({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:31415", cookie: sessionCookie } } as any)).toBe(true);
  });
  it("revokes the server-side local session token during logout", async () => {
    vi.resetModules();
    const runtime = await import("./local-runtime");
    runtime.configureLocalListener(31415);
    const bootstrap = new URL(`http://127.0.0.1:31415${runtime.localLaunchPath()}`).searchParams.get("bootstrap");
    const headers = new Map<string, string>();
    runtime.establishLocalSession({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:31415" }, query: { bootstrap } } as any, { setHeader: (name: string, value: string) => headers.set(name, value), redirect: vi.fn() } as any);
    const sessionCookie = headers.get("Set-Cookie") || "";
    expect(runtime.hasLocalSession({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:31415", cookie: sessionCookie } } as any)).toBe(true);
    runtime.clearLocalSession({ setHeader: vi.fn() } as any);
    expect(runtime.hasLocalSession({ socket: { remoteAddress: "127.0.0.1" }, headers: { host: "127.0.0.1:31415", cookie: sessionCookie } } as any)).toBe(false);
  });

  it("polls only checkpoints that are absent or due", () => {
    const now = new Date("2026-08-18T18:00:00.000Z");
    expect(shouldPollCheckpoint(null, now)).toBe(true);
    expect(shouldPollCheckpoint({ nextRecommendedPollAt: new Date("2026-08-18T17:59:59.000Z") }, now)).toBe(true);
    expect(shouldPollCheckpoint({ nextRecommendedPollAt: new Date("2026-08-18T18:00:01.000Z") }, now)).toBe(false);
  });

  it("uses the desktop shell bootstrap capability when one is supplied", async () => {
    const previous = process.env.FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN;
    process.env.FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN = "desktop-shell-regression-capability";
    vi.resetModules();
    try {
      const { localLaunchPath: launchPathFromFreshRuntime } = await import("./local-runtime");
      const capability = new URL(`http://127.0.0.1:31415${launchPathFromFreshRuntime()}`).searchParams.get("bootstrap");
      expect(capability).toBe("desktop-shell-regression-capability");
    } finally {
      if (previous === undefined) delete process.env.FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN;
      else process.env.FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN = previous;
      vi.resetModules();
    }
  });
});
