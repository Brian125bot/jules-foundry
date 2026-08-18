import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("prebuilt local-user distribution", () => {
  it("keeps contributor and direct-user launch paths explicit", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    const preparationScript = await readFile(new URL("../scripts/prepare-local-release.mjs", import.meta.url), "utf8");
    const launchScript = await readFile(new URL("../scripts/start-local.mjs", import.meta.url), "utf8");
    const guide = await readFile(new URL("../docs/LOCAL_RUN_GUIDE.md", import.meta.url), "utf8");

    expect(packageJson.scripts.start).toContain("pnpm build");
    expect(packageJson.scripts["local:bundle"]).toContain("prepare-local-release");
    expect(preparationScript).toContain('"--filter", ".", "deploy", "--legacy", "--prod"');
    expect(preparationScript).toContain('"dist"');
    expect(preparationScript).toContain('"drizzle-local"');
    expect(preparationScript).toContain("retainedBundleEntries");
    expect(launchScript).toContain('NODE_ENV: "production"');
    expect(guide).toContain("node start-local.mjs");
  });
});
