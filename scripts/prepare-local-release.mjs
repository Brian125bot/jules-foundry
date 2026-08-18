import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const root = process.cwd();
const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const safeVersion = String(manifest.version).replace(/[^0-9A-Za-z.-]/g, "-");
const bundleName = `jules-foundry-local-${safeVersion}-${process.platform}-${process.arch}`;
const releaseRoot = resolve(root, "local-release");
const bundleDirectory = join(releaseRoot, bundleName);
const archivePath = join(releaseRoot, `${bundleName}.tar.gz`);

for (const requiredPath of ["dist", "drizzle-local", "scripts/start-local.mjs"]) {
  if (!existsSync(join(root, requiredPath))) throw new Error(`Missing ${requiredPath}. Run pnpm build before preparing a local-user bundle.`);
}

await mkdir(releaseRoot, { recursive: true });
await rm(bundleDirectory, { recursive: true, force: true });
await rm(archivePath, { force: true });

execFileSync("pnpm", ["--filter", ".", "deploy", "--legacy", "--prod", bundleDirectory], { cwd: root, stdio: "inherit" });
await cp(join(root, "dist"), join(bundleDirectory, "dist"), { recursive: true });
await cp(join(root, "drizzle-local"), join(bundleDirectory, "drizzle-local"), { recursive: true });
await cp(join(root, "scripts", "start-local.mjs"), join(bundleDirectory, "start-local.mjs"));

const bundleManifestPath = join(bundleDirectory, "package.json");
const bundleManifest = JSON.parse(await readFile(bundleManifestPath, "utf8"));
delete bundleManifest.devDependencies;
delete bundleManifest.pnpm;
delete bundleManifest.packageManager;
bundleManifest.private = true;
bundleManifest.scripts = {
  start: "NODE_ENV=production node dist/index.js",
  local: "node start-local.mjs",
};
await writeFile(bundleManifestPath, `${JSON.stringify(bundleManifest, null, 2)}\n`);

const retainedBundleEntries = new Set(["package.json", "node_modules", "dist", "drizzle-local", "start-local.mjs", "README.md"]);
for (const entry of await readdir(bundleDirectory)) {
  if (!retainedBundleEntries.has(entry)) await rm(join(bundleDirectory, entry), { recursive: true, force: true });
}

const directUserReadme = `# Jules Foundry Local Bundle\n\nThis package contains the prebuilt browser and server output, SQLite migrations, and production dependencies only. Install Node.js 22, extract this directory, then run:\n\n\`\`\`bash\nnode start-local.mjs\n\`\`\`\n\nThe application opens a one-time loopback browser session and stores data outside this directory. Use Credential vault in the app to add Gemini, Jules, and GitHub credentials. This bundle intentionally omits source code, tests, Vite, TypeScript, pnpm, and contributor tooling. Do not run \`pnpm install\`, \`pnpm build\`, or contributor test commands here.\n`;
await writeFile(join(bundleDirectory, "README.md"), directUserReadme);

try {
  execFileSync("tar", ["-czf", archivePath, "-C", releaseRoot, bundleName], { stdio: "inherit" });
  console.log(`Prepared direct-user archive: ${archivePath}`);
} catch {
  console.warn(`Prepared direct-user directory: ${bundleDirectory}. Archive creation was skipped because tar is unavailable.`);
}

console.log(`Direct-user bundle is ready at ${bundleDirectory}. Launch it with node start-local.mjs.`);
