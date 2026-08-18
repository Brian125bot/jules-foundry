import { mkdtemp, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { arch, platform, tmpdir } from "node:os";
import { join } from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const targetMap = {
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
}[`${platform()}-${arch()}`];

if (!targetMap) throw new Error(`Unsupported packaged-sidecar smoke-test host: ${platform()}-${arch()}.`);

const binaryStem = join(root, "src-tauri", "binaries", `foundry-service-${targetMap}`);
const binary = [binaryStem, `${binaryStem}.exe`].find(existsSync);
const resources = join(root, "src-tauri", "resources");
if (!binary) throw new Error("Packaged sidecar is missing. Run pnpm desktop:prepare before pnpm desktop:smoke.");
await stat(join(resources, "public", "index.html"));
await stat(join(resources, "drizzle-local", "0000_open_khan.sql"));
await stat(join(resources, "node_modules", "@napi-rs", "keyring"));

const dataDirectory = await mkdtemp(join(tmpdir(), "jules-foundry-packaged-smoke-"));
const port = Number(process.env.FOUNDRY_SMOKE_PORT || String(32000 + (process.pid % 1_000)));
const capability = "packaged-sidecar-smoke-capability";
let output = "";
const child = spawn(binary, [], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: "production",
    FOUNDRY_DATA_DIR: dataDirectory,
    FOUNDRY_VAULT_MODE: "os_keychain",
    FOUNDRY_VAULT_PASSPHRASE: "packaged-sidecar-recovery-fallback",
    FOUNDRY_OPEN_BROWSER: "false",
    FOUNDRY_PORT: String(port),
    FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN: capability,
    FOUNDRY_MIGRATION_PATH: join(resources, "drizzle-local", "0000_open_khan.sql"),
    FOUNDRY_STATIC_DIR: join(resources, "public"),
    FOUNDRY_NATIVE_MODULES_DIR: join(resources, "node_modules"),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
child.stdout.on("data", chunk => { output += chunk.toString(); });
child.stderr.on("data", chunk => { output += chunk.toString(); });

async function waitForSidecar(sidecarPort, logs) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${sidecarPort}/local/bootstrap?bootstrap=invalid`, { redirect: "manual" });
      if (response.status === 403) return;
    } catch { /* The listener has not started yet. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Packaged sidecar did not start on loopback.\n${logs()}`);
}

async function stopSidecar(sidecar, sidecarDataDirectory) {
  if (sidecar.exitCode === null) {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Packaged sidecar did not finish its SIGTERM shutdown within five seconds.")), 5_000);
      sidecar.once("exit", () => { clearTimeout(timeout); resolve(undefined); });
      sidecar.kill("SIGTERM");
    });
  }
  const lockPath = join(sidecarDataDirectory, "foundry.instance.lock");
  if (existsSync(lockPath)) throw new Error("Packaged sidecar did not release its local data-directory lock during shutdown.");
  const walPath = join(sidecarDataDirectory, "foundry.sqlite-wal");
  if (existsSync(walPath) && (await stat(walPath)).size > 0) throw new Error("Packaged sidecar did not complete its SQLite WAL checkpoint during shutdown.");
}

let stopped = false;
try {
  await waitForSidecar(port, () => output);
  const bootstrap = await fetch(`http://127.0.0.1:${port}/local/bootstrap?bootstrap=${capability}`, { redirect: "manual" });
  const cookie = bootstrap.headers.get("set-cookie");
  if (bootstrap.status !== 303 || !cookie?.includes("HttpOnly")) throw new Error(`Expected one-time bootstrap session exchange.\n${output}`);
  const headers = { cookie };
  const query = encodeURIComponent(JSON.stringify({ json: null }));
  const [shell, auth, diagnostics] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/`, { headers }),
    fetch(`http://127.0.0.1:${port}/api/trpc/auth.me?input=${query}`, { headers }),
    fetch(`http://127.0.0.1:${port}/api/trpc/local.diagnostics?input=${query}`, { headers }),
  ]);
  const [shellHtml, authPayload, diagnosticsPayload] = await Promise.all([shell.text(), auth.json(), diagnostics.json()]);
  const operator = authPayload?.result?.data?.json;
  const runtime = diagnosticsPayload?.result?.data?.json?.runtime;
  const vault = diagnosticsPayload?.result?.data?.json?.vault;
  if (!shell.ok || !shellHtml.includes('<div id="root"></div>')) throw new Error("Packaged sidecar did not serve the local dashboard shell after bootstrap.");
  if (operator?.openId !== "local-operator" || operator?.role !== "admin") throw new Error("Packaged sidecar did not return seeded local-operator data after bootstrap.");
  if (runtime?.loopbackOnly !== true || vault?.available !== true) throw new Error("Packaged sidecar did not report a ready loopback runtime and vault.");
  if (process.env.FOUNDRY_REQUIRE_KEYCHAIN === "true" && vault?.mode !== "os_keychain") throw new Error("The packaged keyring module did not produce an OS-keychain vault on this host.");
  const chromium = process.env.FOUNDRY_CHROMIUM_PATH || "/usr/bin/chromium";
  if (!existsSync(chromium)) throw new Error("Headless Chromium is required for the packaged dashboard-render regression. Set FOUNDRY_CHROMIUM_PATH to its executable path.");
  const renderDataDirectory = await mkdtemp(join(tmpdir(), "jules-foundry-packaged-render-"));
  const renderPort = port + 1;
  const renderCapability = "packaged-sidecar-render-capability";
  let renderOutput = "";
  const renderChild = spawn(binary, [], { cwd: root, env: { ...process.env, NODE_ENV: "production", FOUNDRY_DATA_DIR: renderDataDirectory, FOUNDRY_VAULT_MODE: "os_keychain", FOUNDRY_VAULT_PASSPHRASE: "packaged-sidecar-render-recovery", FOUNDRY_OPEN_BROWSER: "false", FOUNDRY_PORT: String(renderPort), FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN: renderCapability, FOUNDRY_MIGRATION_PATH: join(resources, "drizzle-local", "0000_open_khan.sql"), FOUNDRY_STATIC_DIR: join(resources, "public"), FOUNDRY_NATIVE_MODULES_DIR: join(resources, "node_modules") }, stdio: ["ignore", "pipe", "pipe"] });
  renderChild.stdout.on("data", chunk => { renderOutput += chunk.toString(); });
  renderChild.stderr.on("data", chunk => { renderOutput += chunk.toString(); });
  try {
    await waitForSidecar(renderPort, () => renderOutput);
    const { stdout } = await execFileAsync(chromium, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--run-all-compositor-stages-before-draw", "--virtual-time-budget=10000", `--user-data-dir=${join(renderDataDirectory, "chromium-profile")}`, "--dump-dom", `http://127.0.0.1:${renderPort}/local/bootstrap?bootstrap=${renderCapability}`], { timeout: 20_000, maxBuffer: 5 * 1024 * 1024 });
    if (!stdout.includes("Command center") || !stdout.includes("Local operator")) throw new Error("Packaged sidecar bootstrap did not render authenticated local-operator dashboard content.");
  } finally {
    await stopSidecar(renderChild, renderDataDirectory);
    await rm(renderDataDirectory, { recursive: true, force: true });
  }
  await stopSidecar(child, dataDirectory);
  stopped = true;
  console.log(`Packaged sidecar smoke passed with ${vault.mode} vault mode and seeded local operator access.`);
} finally {
  if (!stopped && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => child.once("exit", resolve));
  }
  await rm(dataDirectory, { recursive: true, force: true });
}
