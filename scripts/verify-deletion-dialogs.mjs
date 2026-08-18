import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createClient } from "@libsql/client";

const root = process.cwd();
const chromium = process.env.FOUNDRY_CHROMIUM_PATH || "/usr/bin/chromium";
if (!existsSync(chromium)) throw new Error("Chromium is required for deletion-dialog verification.");
const port = Number(process.env.FOUNDRY_DELETE_SMOKE_PORT || String(32600 + (process.pid % 200)));
const debugPort = port + 100;
const dataDirectory = await mkdtemp(join(tmpdir(), "jules-foundry-delete-dialog-"));
const resources = join(root, "src-tauri", "resources");
const capability = "delete-dialog-verification-capability";
let sidecar;
let browser;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(url, predicate, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (await predicate(response)) return; } catch { /* startup in progress */ }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

class Cdp {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 1;
    this.pending = new Map();
  }
  async ready() { await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve); this.socket.addEventListener("error", reject); }); this.socket.addEventListener("message", event => { const message = JSON.parse(event.data); const pending = this.pending.get(message.id); if (pending) { this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); } }); }
  send(method, params = {}) { return new Promise((resolve, reject) => { const id = this.nextId++; this.pending.set(id, { resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(expression) { const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); return result.result?.value; }
}

async function pageEvaluate(cdp, expression) { return cdp.evaluate(`(async()=>(${expression}))()`); }
async function waitForText(cdp, text, timeout = 15_000) { return pageEvaluate(cdp, `await (async()=>{const until=Date.now()+${timeout}; while(Date.now()<until){if(document.body.innerText.includes(${JSON.stringify(text)})) return true; await new Promise(r=>setTimeout(r,100));} return false;})()`); }
async function waitForSelector(cdp, selector, timeout = 15_000) { return pageEvaluate(cdp, `await (async()=>{const until=Date.now()+${timeout}; while(Date.now()<until){if(document.querySelector(${JSON.stringify(selector)})) return true; await new Promise(r=>setTimeout(r,100));} return false;})()`); }
async function clickText(cdp, text) { return pageEvaluate(cdp, `(()=>{const el=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}); if(!el) return false; el.click(); return true;})()`); }
async function fill(cdp, id, value) { const focused = await pageEvaluate(cdp, `(()=>{const el=document.getElementById(${JSON.stringify(id)}); if(!el) return false; el.focus(); el.select?.(); return true;})()`); if (!focused) return false; await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "a", code: "KeyA", modifiers: 2 }); await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2 }); await cdp.send("Input.insertText", { text: value }); return true; }

try {
  sidecar = spawn(join(root, "src-tauri", "binaries", "foundry-service-x86_64-unknown-linux-gnu"), [], { cwd: root, env: { ...process.env, NODE_ENV: "production", FOUNDRY_DATA_DIR: dataDirectory, FOUNDRY_VAULT_MODE: "passphrase", FOUNDRY_VAULT_PASSPHRASE: "delete-dialog-verification", FOUNDRY_OPEN_BROWSER: "false", FOUNDRY_PORT: String(port), FOUNDRY_DESKTOP_BOOTSTRAP_TOKEN: capability, FOUNDRY_MIGRATION_PATH: join(resources, "drizzle-local", "0000_open_khan.sql"), FOUNDRY_STATIC_DIR: join(resources, "public"), FOUNDRY_NATIVE_MODULES_DIR: join(resources, "node_modules") }, stdio: "ignore" });
  await waitFor(`http://127.0.0.1:${port}/local/bootstrap?bootstrap=invalid`, response => Promise.resolve(response.status === 403));
  browser = spawn(chromium, ["--headless", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=" + debugPort, "--user-data-dir=" + join(dataDirectory, "chrome"), "about:blank"], { stdio: "ignore" });
  await waitFor(`http://127.0.0.1:${debugPort}/json/list`, async response => { const pages = await response.json(); return Boolean(pages.find(page => page.type === "page" && page.webSocketDebuggerUrl)); });
  const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const page = pages.find(item => item.type === "page" && item.webSocketDebuggerUrl);
  const cdp = new Cdp(page.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/local/bootstrap?bootstrap=${capability}` });
  if (!await waitForText(cdp, "Command center")) throw new Error("Authenticated dashboard did not render.");
  await pageEvaluate(cdp, "window.location.href='/initiatives'; await new Promise(r=>setTimeout(r,1500)); true");
  if (!await waitForText(cdp, "New initiative")) throw new Error("Initiatives workspace did not render.");
  const created = await pageEvaluate(cdp, `fetch('/api/trpc/foundry.initiatives.create', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ json: { title: 'Deletion dialog visual verification', prompt: 'Verify the local deletion confirmation control with a transient local initiative.', repository: 'Brian125bot/jules-foundry', branch: 'main', budgetCents: 500, geminiModel: 'gemini-2.5-flash' } }) }).then(response => response.json())`);
  if (!created?.result?.data?.json?.id) throw new Error(`Transient initiative creation failed: ${JSON.stringify(created)}`);
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/initiatives` });
  await sleep(2500);
  if (!await waitForText(cdp, "Deletion dialog visual verification", 20_000)) throw new Error("Transient initiative was not persisted for dialog verification.");
  await clickText(cdp, "Delete");
  if (!await waitForText(cdp, "Delete initiative")) throw new Error("Deletion confirmation dialog did not open.");
  if (!await waitForSelector(cdp, "#delete-confirmation", 20_000)) throw new Error(`Deletion preview did not finish loading its confirmation controls.\n${await pageEvaluate(cdp, "document.body.innerText")}`);
  const desktop = await pageEvaluate(cdp, "(()=>{const dialog=[...document.querySelectorAll('[role=dialog]')].find(item=>getComputedStyle(item).display!=='none'&&getComputedStyle(item).visibility!=='hidden'); const button=[...dialog.querySelectorAll('button')].find(item=>item.textContent.includes('Delete initiative')); const rect=dialog.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight],dialog:[rect.x,rect.y,rect.width,rect.height],confirmation:Boolean(dialog.querySelector('#delete-confirmation')),inputIds:[...dialog.querySelectorAll('input')].map(item=>item.id),buttonTexts:[...dialog.querySelectorAll('button')].map(item=>item.textContent.trim()),typedConfirmationRequired:Boolean(button?.disabled),fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};})()");
  if (!desktop.confirmation || !desktop.typedConfirmationRequired || !desktop.fits) throw new Error(`Desktop deletion dialog containment/confirmation failed: ${JSON.stringify(desktop)}`);
  const desktopShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/jules-foundry-deletion-dialog-desktop.png", Buffer.from(desktopShot.data, "base64"));
  await clickText(cdp, "Cancel");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await clickText(cdp, "Delete");
  if (!await waitForText(cdp, "Delete initiative")) throw new Error("Mobile deletion confirmation dialog did not open.");
  const mobile = await pageEvaluate(cdp, "(()=>{const dialog=[...document.querySelectorAll('[role=dialog]')].find(item=>getComputedStyle(item).display!=='none'&&getComputedStyle(item).visibility!=='hidden'); const button=[...dialog.querySelectorAll('button')].find(item=>item.textContent.includes('Delete initiative')); const rect=dialog.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight],dialog:[rect.x,rect.y,rect.width,rect.height],confirmation:Boolean(dialog.querySelector('#delete-confirmation')),inputIds:[...dialog.querySelectorAll('input')].map(item=>item.id),buttonTexts:[...dialog.querySelectorAll('button')].map(item=>item.textContent.trim()),typedConfirmationRequired:Boolean(button?.disabled),fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};})()");
  if (!mobile.confirmation || !mobile.typedConfirmationRequired || !mobile.fits) throw new Error(`Mobile deletion dialog containment/confirmation failed: ${JSON.stringify(mobile)}`);
  const mobileShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/jules-foundry-deletion-dialog-mobile.png", Buffer.from(mobileShot.data, "base64"));
  await clickText(cdp, "Cancel");
  const ledger = createClient({ url: `file:${join(dataDirectory, "foundry.sqlite")}`, intMode: "number" });
  const initiativeId = created.result.data.json.id;
  const nowSeconds = Math.floor(Date.now() / 1000);
  await ledger.execute({ sql: "INSERT INTO tasks (initiativeId, taskKey, title, description, riskTier, state, health, allowedPaths, nonGoals, acceptanceCriteria, dependencies, dispatchOrder, requirePlanApproval, autoCreatePr, idempotencyKey, julesSessionName, createdAt, updatedAt) VALUES (?, ?, ?, ?, 'green', 'executing', 'healthy', ?, ?, ?, ?, 1, 1, 1, ?, ?, ?, ?)", args: [initiativeId, `delete-lock-${process.pid}`, "Active Jules deletion-lock fixture", "Transient active-session fixture for responsive deletion verification.", JSON.stringify(["src"]), JSON.stringify([]), JSON.stringify([]), JSON.stringify([]), `delete-lock-idempotency-${process.pid}`, "jules/smoke-active-session", nowSeconds, nowSeconds] });
  ledger.close?.();
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.send("Page.navigate", { url: `http://127.0.0.1:${port}/initiatives` });
  await sleep(2500);
  if (!await waitForText(cdp, "Active Jules deletion-lock fixture", 20_000)) throw new Error("Active-session fixture did not render in the initiative card.");
  await clickText(cdp, "Delete");
  if (!await waitForText(cdp, "Deletion is locked")) throw new Error("Desktop active-session deletion lock warning did not render.");
  const lockedDesktop = await pageEvaluate(cdp, "(()=>{const dialog=[...document.querySelectorAll('[role=dialog]')].find(item=>getComputedStyle(item).display!=='none'&&getComputedStyle(item).visibility!=='hidden'); const rect=dialog.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight],locked:dialog.innerText.includes('Deletion is locked'),blocked:![...dialog.querySelectorAll('button')].some(item=>item.textContent.includes('Delete initiative')),fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};})()");
  if (!lockedDesktop.locked || !lockedDesktop.blocked || !lockedDesktop.fits) throw new Error(`Desktop active-session deletion lock failed: ${JSON.stringify(lockedDesktop)}`);
  await writeFile("/tmp/jules-foundry-deletion-dialog-locked-desktop.png", Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  await clickText(cdp, "Close");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await clickText(cdp, "Delete");
  if (!await waitForText(cdp, "Deletion is locked")) throw new Error("Mobile active-session deletion lock warning did not render.");
  const lockedMobile = await pageEvaluate(cdp, "(()=>{const dialog=[...document.querySelectorAll('[role=dialog]')].find(item=>getComputedStyle(item).display!=='none'&&getComputedStyle(item).visibility!=='hidden'); const rect=dialog.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight],locked:dialog.innerText.includes('Deletion is locked'),blocked:![...dialog.querySelectorAll('button')].some(item=>item.textContent.includes('Delete initiative')),fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};})()");
  if (!lockedMobile.locked || !lockedMobile.blocked || !lockedMobile.fits) throw new Error(`Mobile active-session deletion lock failed: ${JSON.stringify(lockedMobile)}`);
  await writeFile("/tmp/jules-foundry-deletion-dialog-locked-mobile.png", Buffer.from((await cdp.send("Page.captureScreenshot", { format: "png" })).data, "base64"));
  console.log(`Deletion dialog verification passed: typed confirmation desktop ${desktop.dialog[2]}x${desktop.dialog[3]}, mobile ${mobile.dialog[2]}x${mobile.dialog[3]}; active-session lock desktop ${lockedDesktop.dialog ?? lockedDesktop.viewport}, mobile ${lockedMobile.viewport}.`);
} finally {
  if (browser && browser.exitCode === null) { browser.kill(); await new Promise(resolve => browser.once("exit", resolve)); }
  if (sidecar && sidecar.exitCode === null) { sidecar.kill(); await new Promise(resolve => sidecar.once("exit", resolve)); }
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
