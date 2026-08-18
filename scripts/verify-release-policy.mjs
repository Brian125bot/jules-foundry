import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const pinnedVersion = packageJson.packageManager?.match(/^pnpm@(\d+\.\d+\.\d+)/)?.[1];
if (!pinnedVersion) throw new Error("package.json must pin an exact pnpm packageManager version.");
const installedVersion = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim();
if (installedVersion !== pinnedVersion) throw new Error(`pnpm ${pinnedVersion} is required; found ${installedVersion}. Enable Corepack or install the pinned version.`);
if (!existsSync("pnpm-workspace.yaml")) throw new Error("pnpm-workspace.yaml is required to enforce dependency policy.");
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
for (const requiredPolicy of ["patchedDependencies:", "overrides:", "onlyBuiltDependencies:"]) {
  if (!workspace.includes(requiredPolicy)) throw new Error(`pnpm-workspace.yaml is missing ${requiredPolicy}`);
}
if (!existsSync("patches/wouter@3.7.1.patch")) throw new Error("Required Wouter compatibility patch is missing.");
console.log(`Verified pnpm ${installedVersion} and the checked-in dependency policy.`);
