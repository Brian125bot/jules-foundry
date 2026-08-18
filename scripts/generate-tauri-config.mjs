import { readFile, writeFile } from "node:fs/promises";

const VALID_MODES = new Set(["unsigned", "signed"]);

function readMode(argv) {
  const argument = argv.find(value => value.startsWith("--mode="));
  return argument?.slice("--mode=".length) || "unsigned";
}

function assertHttpsEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error("TAURI_UPDATE_ENDPOINT must be a valid HTTPS URL for signed releases.");
  }
}

export async function generateTauriConfig(mode = "unsigned") {
  if (!VALID_MODES.has(mode)) throw new Error(`Unsupported desktop configuration mode: ${mode}.`);
  const template = JSON.parse(await readFile("src-tauri/tauri.conf.template.json", "utf8"));
  const updater = template.plugins?.updater;
  if (!updater) throw new Error("The Tauri configuration template is missing its updater configuration.");

  if (mode === "signed") {
    const publicKey = process.env.TAURI_UPDATE_PUBLIC_KEY;
    const endpoint = process.env.TAURI_UPDATE_ENDPOINT;
    if (!publicKey || !endpoint) throw new Error("TAURI_UPDATE_PUBLIC_KEY and TAURI_UPDATE_ENDPOINT are required for signed desktop releases.");
    assertHttpsEndpoint(endpoint);
    updater.pubkey = publicKey;
    updater.endpoints = [endpoint];
    template.bundle.createUpdaterArtifacts = true;
  } else {
    delete template.plugins.updater;
    if (Object.keys(template.plugins).length === 0) delete template.plugins;
    template.bundle.createUpdaterArtifacts = false;
  }

  const rendered = `${JSON.stringify(template, null, 2)}\n`;
  if (rendered.includes("__TAURI_UPDATE_")) throw new Error("Generated Tauri configuration still contains updater placeholders.");
  await writeFile("src-tauri/tauri.conf.json", rendered, "utf8");
  console.log(`Generated ${mode} Tauri configuration.`);
}

if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  await generateTauriConfig(readMode(process.argv.slice(2)));
}
