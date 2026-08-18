import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parse } from "yaml";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const lockSource = await readFile("pnpm-lock.yaml", "utf8");
const lock = parse(lockSource);
const packages = lock.packages || {};
const components = Object.entries(packages).map(([key, value]) => {
  const parsed = key.replace(/^\//, "");
  const at = parsed.lastIndexOf("@");
  const name = at > 0 ? parsed.slice(0, at) : parsed;
  const version = at > 0 ? parsed.slice(at + 1).split("(")[0] : String(value?.version || "unknown");
  return { type: "library", name, version, purl: `pkg:npm/${encodeURIComponent(name).replace("%40", "@")}@${version}`, properties: [{ name: "jules-foundry:lock-key", value: key }] };
}).sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`));
const output = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${createHash("sha256").update(lockSource).digest("hex").slice(0, 32)}`,
  version: 1,
  metadata: { timestamp: new Date().toISOString(), component: { type: "application", name: packageJson.name, version: packageJson.version }, properties: [{ name: "jules-foundry:pnpm-lock-sha256", value: createHash("sha256").update(lockSource).digest("hex") }] },
  components,
};
await mkdir("release", { recursive: true });
await writeFile("release/sbom.cdx.json", `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Wrote lockfile-derived SBOM with ${components.length} components.`);
