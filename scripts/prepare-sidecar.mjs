import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { platform, arch } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const targetMap = {
  "linux-x64": { pkg: "node22-linux-x64", tauri: "x86_64-unknown-linux-gnu", libsql: "linux-x64-gnu", keyring: "keyring-linux-x64-gnu" },
  "linux-arm64": { pkg: "node22-linux-arm64", tauri: "aarch64-unknown-linux-gnu", libsql: "linux-arm64-gnu", keyring: "keyring-linux-arm64-gnu" },
  "darwin-arm64": { pkg: "node22-macos-arm64", tauri: "aarch64-apple-darwin", libsql: "darwin-arm64", keyring: "keyring-darwin-arm64" },
  "darwin-x64": { pkg: "node22-macos-x64", tauri: "x86_64-apple-darwin", libsql: "darwin-x64", keyring: "keyring-darwin-x64" },
  "win32-x64": { pkg: "node22-win-x64", tauri: "x86_64-pc-windows-msvc", libsql: "win32-x64-msvc", keyring: "keyring-win32-x64-msvc" },
  "win32-arm64": { pkg: "node22-win-arm64", tauri: "aarch64-pc-windows-msvc", libsql: "win32-arm64-msvc", keyring: "keyring-win32-arm64-msvc" },
}[`${platform()}-${arch()}`];
if (!targetMap) throw new Error(`Unsupported sidecar build host: ${platform()}-${arch()}. Build on a supported native release runner.`);
const intermediate = join(root, "desktop-dist", "foundry-service.cjs");
const output = join(root, "src-tauri", "binaries", `foundry-service-${targetMap.tauri}`);
await mkdir(join(root, "src-tauri", "binaries"), { recursive: true });
await mkdir(join(root, "desktop-dist"), { recursive: true });
await rm(output, { force: true });
execFileSync("pnpm", ["exec", "esbuild", "server/_core/index.ts", "--platform=node", "--bundle", "--format=cjs", `--outfile=${intermediate}`, "--external:@napi-rs/keyring", "--external:@libsql/*", "--external:libsql", "--external:js-base64", "--external:promise-limit", "--external:./vite"], { stdio: "inherit" });
execFileSync("pnpm", ["exec", "pkg", intermediate, "--target", targetMap.pkg, "--output", output, "--fallback-to-source"], { stdio: "inherit" });
await cp(join(root, "drizzle-local"), join(root, "src-tauri", "resources", "drizzle-local"), { recursive: true, force: true });
await cp(join(root, "dist", "public"), join(root, "src-tauri", "resources", "public"), { recursive: true, force: true });
const nativeRoot = join(root, "src-tauri", "resources", "node_modules");
await rm(nativeRoot, { recursive: true, force: true });
const pnpmRoot = join(root, "node_modules", ".pnpm");
const pnpmPackages = await readdir(pnpmRoot);
function pnpmPackagePath(prefix, packagePath) {
  const folder = pnpmPackages.find(name => name.startsWith(`${prefix}@`));
  if (!folder) throw new Error(`Required desktop native package ${prefix} is not installed for this build host.`);
  return join(pnpmRoot, folder, "node_modules", ...packagePath.split("/"));
}
async function copyPnpmPackage(prefix, packagePath) {
  await cp(pnpmPackagePath(prefix, packagePath), join(nativeRoot, ...packagePath.split("/")), { recursive: true, force: true, dereference: true });
}
await copyPnpmPackage("@libsql+client", "@libsql/client");
await copyPnpmPackage("@libsql+core", "@libsql/core");
await copyPnpmPackage("@libsql+hrana-client", "@libsql/hrana-client");
await copyPnpmPackage("@libsql+isomorphic-ws", "@libsql/isomorphic-ws");
await copyPnpmPackage("ws", "ws");
await copyPnpmPackage("drizzle-orm", "drizzle-orm");
await copyPnpmPackage("libsql", "libsql");
await copyPnpmPackage("@neon-rs+load", "@neon-rs/load");
await copyPnpmPackage("detect-libc", "detect-libc");
await copyPnpmPackage("js-base64", "js-base64");
await copyPnpmPackage("promise-limit", "promise-limit");
await copyPnpmPackage(`@libsql+${targetMap.libsql}`, `@libsql/${targetMap.libsql}`);
await copyPnpmPackage("@napi-rs+keyring", "@napi-rs/keyring");
await copyPnpmPackage(`@napi-rs+${targetMap.keyring}`, `@napi-rs/${targetMap.keyring}`);
console.log(`Prepared Jules Foundry local-service sidecar for ${targetMap.tauri}.`);
