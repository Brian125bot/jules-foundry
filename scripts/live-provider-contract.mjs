import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import axios from "axios";

const required = ["FOUNDRY_LIVE_GITHUB_TOKEN", "FOUNDRY_LIVE_JULES_API_KEY", "FOUNDRY_LIVE_GEMINI_API_KEY", "FOUNDRY_LIVE_FIXTURE_REPOSITORY", "FOUNDRY_LIVE_FIXTURE_BRANCH"];
if (process.env.RUN_LIVE_PROVIDER_CONTRACTS !== "1") throw new Error("Live provider contracts are disabled. Set RUN_LIVE_PROVIDER_CONTRACTS=1 only for disposable, least-privilege fixture resources.");
const missing = required.filter(key => !process.env[key]);
if (missing.length) throw new Error(`Live provider contract configuration is incomplete: ${missing.join(", ")}`);

const githubToken = process.env.FOUNDRY_LIVE_GITHUB_TOKEN;
const julesKey = process.env.FOUNDRY_LIVE_JULES_API_KEY;
const geminiKey = process.env.FOUNDRY_LIVE_GEMINI_API_KEY;
const repository = process.env.FOUNDRY_LIVE_FIXTURE_REPOSITORY;
const branch = process.env.FOUNDRY_LIVE_FIXTURE_BRANCH;
const startedAt = new Date().toISOString();
const operations = [];
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const record = (provider, operation, response) => operations.push({ provider, operation, status: response.status, payloadDigest: digest(response.data), at: new Date().toISOString() });

try {
  const github = await axios.get(`https://api.github.com/repos/${repository}/branches/${encodeURIComponent(branch)}`, { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" }, timeout: 15_000 });
  record("github", "fixture_branch_visibility", github);
  const gemini = await axios.get("https://generativelanguage.googleapis.com/v1beta/models", { params: { key: geminiKey, pageSize: 1 }, timeout: 15_000 });
  record("gemini", "model_listing", gemini);
  const jules = await axios.get("https://jules.googleapis.com/v1alpha/sources", { headers: { "x-goog-api-key": julesKey }, params: { pageSize: 1 }, timeout: 15_000 });
  record("jules", "source_listing", jules);
  await mkdir("release/live-provider-contracts", { recursive: true });
  const transcript = { schemaVersion: 1, startedAt, completedAt: new Date().toISOString(), fixture: { repository, branch }, operations, secretsRedacted: true, sessionCreation: "not run; requires separate explicit reviewed procedure" };
  const path = join("release/live-provider-contracts", `contract-${Date.now()}.redacted.json`);
  await writeFile(path, `${JSON.stringify(transcript, null, 2)}\n`);
  console.log(`Live provider preflight passed. Wrote redacted transcript: ${path}`);
} catch (error) {
  const message = axios.isAxiosError(error) ? `Provider contract failed with HTTP ${error.response?.status ?? "network error"}` : "Provider contract failed";
  throw new Error(message);
}
