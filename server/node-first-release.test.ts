import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);

describe("Node-first local distribution", () => {
  it("keeps one-command local start and omits desktop packaging scripts and dependencies", async () => {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    expect(packageJson.scripts.start).toBe("pnpm build && NODE_ENV=production node dist/index.js");
    expect(packageJson.scripts.local).toBe("pnpm start");
    expect(Object.keys(packageJson.scripts).some((name: string) => name.startsWith("desktop:") || name.includes("tauri"))).toBe(false);
    expect(JSON.stringify({ ...packageJson.dependencies, ...packageJson.devDependencies })).not.toContain("@tauri-apps/");
    await expect(access(new URL("../src-tauri", import.meta.url), constants.F_OK)).rejects.toThrow();
  });

  it("keeps CI focused on the Node/browser validation workflow", async () => {
    const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
    expect(workflow).not.toMatch(/tauri|rust-toolchain|sidecar|TAURI_/i);
    expect(workflow).toContain("pnpm release:verify");
  });
});
