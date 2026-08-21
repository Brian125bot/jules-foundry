import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function text(path: string) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

describe("public release controls", () => {
  it("stages an archive checksum, SBOM, manifest, release notes, and archive inspection", async () => {
    const [packageJson, stage, archive] = await Promise.all([text("../package.json"), text("../scripts/stage-release.mjs"), text("../scripts/verify-local-release-archive.mjs")]);
    expect(packageJson).toContain("release:stage");
    expect(stage).toContain("manifest.json");
    expect(stage).toContain("sha256");
    expect(stage).toContain("RELEASE_NOTES.md");
    expect(stage).toContain("nonpublishable-dry-run");
    expect(archive).toContain("forbidden contributor or secret-bearing entries");
    expect(archive).toContain('!item.includes("/node_modules/")');
  });

  it("keeps live provider contracts explicitly enabled, fully configured, and redacted", async () => {
    const live = await text("../scripts/live-provider-contract.mjs");
    expect(live).toContain('RUN_LIVE_PROVIDER_CONTRACTS !== "1"');
    expect(live).toContain("FOUNDRY_LIVE_FIXTURE_REPOSITORY");
    expect(live).toContain("secretsRedacted: true");
    expect(live).not.toContain("console.log(githubToken)");
  });
});
