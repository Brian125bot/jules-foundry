import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const required = ["src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/capabilities/default.json"];
for (const path of required) if (!existsSync(path)) throw new Error(`Missing desktop packaging file: ${path}`);
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
if (JSON.stringify(config).includes("__TAURI_UPDATE_")) throw new Error("Generated desktop configuration contains unresolved updater placeholders.");
if (config.plugins?.updater) {
  const endpoint = config.plugins.updater.endpoints?.[0];
  if (!config.plugins.updater.pubkey || !endpoint?.startsWith("https://")) throw new Error("Signed desktop configuration requires a public updater key and HTTPS endpoint.");
}
try { execFileSync("cargo", ["--version"], { stdio: "pipe" }); }
catch { throw new Error("Rust and Cargo are required for a signed desktop build. Install the supported Rust toolchain before running desktop:build."); }
console.log("Desktop packaging prerequisites are present.");
