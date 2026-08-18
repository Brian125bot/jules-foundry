import { afterEach, describe, expect, it, vi } from "vitest";
import { configureLocalListener, establishLocalSession, hasLocalSession, localLaunchPath, requireLocalSession } from "./local-runtime";
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

  it("polls only checkpoints that are absent or due", () => {
    const now = new Date("2026-08-18T18:00:00.000Z");
    expect(shouldPollCheckpoint(null, now)).toBe(true);
    expect(shouldPollCheckpoint({ nextRecommendedPollAt: new Date("2026-08-18T17:59:59.000Z") }, now)).toBe(true);
    expect(shouldPollCheckpoint({ nextRecommendedPollAt: new Date("2026-08-18T18:00:01.000Z") }, now)).toBe(false);
  });
});
