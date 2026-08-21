import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function text(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("public release governance", () => {
  it("ships the license, reporting path, privacy notice, support boundary, and release scope", async () => {
    const [license, security, privacy, contributing, support, scope] = await Promise.all([
      text("../LICENSE"), text("../SECURITY.md"), text("../PRIVACY.md"), text("../CONTRIBUTING.md"), text("../SUPPORT.md"), text("../docs/RELEASE_SCOPE.md"),
    ]);
    expect(license).toContain("MIT License");
    expect(security).toContain("security/advisories/new");
    expect(privacy).toContain("Telemetry");
    expect(contributing).toContain("pnpm release:verify");
    expect(support).toContain("best-effort");
    expect(scope).toContain("linux-x64");
  });

  it("documents the current v2 vault model and rejects obsolete JWT-secret claims", async () => {
    const security = await text("../docs/SECURITY_AND_GOVERNANCE.md");
    expect(security).toContain("AES-256-GCM");
    expect(security).toContain("OS keychain");
    expect(security).toContain("scrypt");
    expect(security).toContain("12-byte IV");
    expect(security).toContain("jf-v2:");
    expect(security).not.toContain("process.env.JWT_SECRET");
  });
});
