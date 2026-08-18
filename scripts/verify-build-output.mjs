import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const outputDirectory = join(process.cwd(), "dist", "public");
const forbiddenTemplateToken = /%VITE_[A-Z0-9_]+%/;
const forbiddenHtmlOrCssOrigin = /(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\//i;
const forbiddenExecutableOrigin = /(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(\s*["']https?:\/\//i;
const secretIndicators = [
  /AIza[\w-]{20,}/,
  /gh[pousr]_[A-Za-z0-9_]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /x-goog-api-key\s*[:=]/i,
  /authorization\s*:\s*bearer\s+[A-Za-z0-9._-]{16,}/i,
];

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  }));
  return nested.flat();
}

if (!existsSync(outputDirectory)) throw new Error("Build output is missing. Run pnpm build before verifying output.");
const candidates = (await collectFiles(outputDirectory)).filter(path => /\.(?:html|js|css|json|map)$/i.test(path));
const failures = [];
for (const path of candidates) {
  const content = await readFile(path, "utf8");
  const label = relative(process.cwd(), path);
  if (forbiddenTemplateToken.test(content)) failures.push(`${label}: unresolved release template token`);
  if (/\.(?:html|css)$/i.test(path) && forbiddenHtmlOrCssOrigin.test(content)) failures.push(`${label}: unapproved external HTTP(S) origin in local-first build output`);
  if (/\.js$/i.test(path) && forbiddenExecutableOrigin.test(content)) failures.push(`${label}: executable external HTTP(S) origin in local-first browser code`);
  for (const indicator of secretIndicators) if (indicator.test(content)) failures.push(`${label}: probable credential or authorization material in build output`);
}

if (failures.length) throw new Error(`Build output verification failed:\n${failures.join("\n")}`);
console.log(`Verified ${candidates.length} built files: no unresolved tokens, unapproved origins, or credential indicators found.`);
