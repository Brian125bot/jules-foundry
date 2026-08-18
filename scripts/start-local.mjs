import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const entrypoint = resolve(root, "dist", "index.js");

if (!existsSync(entrypoint)) {
  console.error("Missing dist/index.js. Use a prebuilt local-user bundle or run pnpm start from a contributor checkout.");
  process.exitCode = 1;
} else {
  const child = spawn(process.execPath, [entrypoint], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production" },
    stdio: "inherit",
  });
  child.once("exit", code => { process.exitCode = code ?? 1; });
  child.once("error", error => { console.error("Unable to launch Jules Foundry:", error.message); process.exitCode = 1; });
}
