import { readFile, writeFile } from "node:fs/promises";

const publicKey = process.env.TAURI_UPDATE_PUBLIC_KEY;
const endpoint = process.env.TAURI_UPDATE_ENDPOINT;
if (!publicKey || !endpoint) throw new Error("TAURI_UPDATE_PUBLIC_KEY and TAURI_UPDATE_ENDPOINT are required to configure signed desktop updates.");
if (!endpoint.startsWith("https://")) throw new Error("TAURI_UPDATE_ENDPOINT must use HTTPS for production releases.");
const template = await readFile("src-tauri/tauri.conf.template.json", "utf8");
const configured = template.replace("__TAURI_UPDATE_PUBLIC_KEY__", publicKey).replace("__TAURI_UPDATE_ENDPOINT__", endpoint);
if (configured.includes("__TAURI_UPDATE_")) throw new Error("Desktop updater template replacement failed.");
await writeFile("src-tauri/tauri.conf.json", `${configured}\n`, "utf8");
console.log("Configured signed desktop updater from CI environment variables.");
