import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

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
async function clickText(cdp, text) { return pageEvaluate(cdp, `(()=>{const el=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(text)}); if(!el) return false; el.click(); return true;})()`); }
async function fill(cdp, id, value) { return pageEvaluate(cdp, `(()=>{const el=document.getElementById(${JSON.stringify(id)}); if(!el) return false; const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true;})()`); }

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
  await clickText(cdp, "New initiative");
  await waitForText(cdp, "Compose an initiative");
  await fill(cdp, "initiative-title", "Deletion dialog visual verification");
  await fill(cdp, "initiative-prompt", "Verify the local deletion confirmation control.");
  await fill(cdp, "initiative-repo", "Brian125bot/jules-foundry");
  await fill(cdp, "initiative-branch", "main");
  await pageEvaluate(cdp, "document.querySelector('form')?.requestSubmit(); true");
  if (!await waitForText(cdp, "Deletion dialog visual verification", 20_000)) throw new Error("Transient initiative was not persisted for dialog verification.");
  await clickText(cdp, "Delete");
  if (!await waitForText(cdp, "Delete initiative")) throw new Error("Deletion confirmation dialog did not open.");
  const desktop = await pageEvaluate(cdp, "(()=>{const dialog=document.querySelector('[role=dialog]'); const button=[...dialog.querySelectorAll('button')].find(item=>item.textContent.includes('Delete initiative')); const rect=dialog.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight],dialog:[rect.x,rect.y,rect.width,rect.height],confirmation:Boolean(dialog.querySelector('#delete-confirmation')),typedConfirmationRequired:Boolean(button?.disabled),fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};})()");
  if (!desktop.confirmation || !desktop.typedConfirmationRequired || !desktop.fits) throw new Error(`Desktop deletion dialog containment/confirmation failed: ${JSON.stringify(desktop)}`);
  const desktopShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/jules-foundry-deletion-dialog-desktop.png", Buffer.from(desktopShot.data, "base64"));
  await clickText(cdp, "Cancel");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await clickText(cdp, "Delete");
  if (!await waitForText(cdp, "Delete initiative")) throw new Error("Mobile deletion confirmation dialog did not open.");
  const mobile = await pageEvaluate(cdp, "(()=>{const dialog=document.querySelector('[role=dialog]'); const button=[...dialog.querySelectorAll('button')].find(item=>item.textContent.includes('Delete initiative')); const rect=dialog.getBoundingClientRect(); return {viewport:[innerWidth,innerHeight],dialog:[rect.x,rect.y,rect.width,rect.height],confirmation:Boolean(dialog.querySelector('#delete-confirmation')),typedConfirmationRequired:Boolean(button?.disabled),fits:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};})()");
  if (!mobile.confirmation || !mobile.typedConfirmationRequired || !mobile.fits) throw new Error(`Mobile deletion dialog containment/confirmation failed: ${JSON.stringify(mobile)}`);
  const mobileShot = await cdp.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/jules-foundry-deletion-dialog-mobile.png", Buffer.from(mobileShot.data, "base64"));
  console.log(`Deletion dialog verification passed: desktop ${desktop.dialog[2]}x${desktop.dialog[3]}, mobile ${mobile.dialog[2]}x${mobile.dialog[3]}, typed confirmation required.`);
} finally {
  if (browser && browser.exitCode === null) browser.kill();
  if (sidecar && sidecar.exitCode === null) { sidecar.kill(); await new Promise(resolve => sidecar.once("exit", resolve)); }
  await rm(dataDirectory, { recursive: true, force: true });
}
