import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const archive = process.argv[2];
if (!archive) throw new Error("Usage: node scripts/verify-local-release-archive.mjs <archive.tar.gz>");
const archivePath = resolve(archive);
if (!existsSync(archivePath)) throw new Error(`Archive does not exist: ${archivePath}`);
if (!archivePath.endsWith(".tar.gz")) throw new Error("Direct-user artifact must be a .tar.gz archive.");

const entries = execFileSync("tar", ["-tzf", archivePath], { encoding: "utf8" }).split("\n").filter(Boolean);
if (!entries.length) throw new Error("Archive is empty.");
const root = entries[0].split("/")[0];
if (!root || !root.startsWith("jules-foundry-local-")) throw new Error("Archive root must be a platform-named Jules Foundry bundle directory.");
const expected = ["README.md", "package.json", "node_modules", "dist", "drizzle-local", "start-local.mjs"];
for (const entry of expected) if (!entries.some(item => item === `${root}/${entry}` || item.startsWith(`${root}/${entry}/`))) throw new Error(`Archive is missing required entry: ${entry}`);
const forbidden = /(^|\/)(\.env(?:\.|$)|\.git(?:\/|$)|client\/|server\/|docs\/|tests?\/|todo[^/]*\.md$)/;
const sourceEntries = entries.filter(item => !item.includes("/node_modules/"));
const unsafe = sourceEntries.filter(item => forbidden.test(item));
if (unsafe.length) throw new Error(`Archive contains forbidden contributor or secret-bearing entries: ${unsafe.slice(0, 12).join(", ")}`);
console.log(`Verified ${basename(archivePath)}: ${entries.length} entries under ${root}; inspected ${sourceEntries.length} source-level entries.`);
