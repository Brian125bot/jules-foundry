import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const required = ["src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/capabilities/default.json"];
for (const path of required) if (!existsSync(path)) throw new Error(`Missing desktop packaging file: ${path}`);
try { execFileSync("cargo", ["--version"], { stdio: "pipe" }); }
catch { throw new Error("Rust and Cargo are required for a signed desktop build. Install the supported Rust toolchain before running desktop:build."); }
console.log("Desktop packaging prerequisites are present.");
