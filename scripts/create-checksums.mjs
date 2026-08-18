import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = process.argv[2] || "release";
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path));
    else if ((await stat(path)).isFile() && !entry.name.endsWith("SHA256SUMS.txt")) output.push(path);
  }
  return output;
}
const entries = await files(root);
const lines = await Promise.all(entries.sort().map(async file => `${createHash("sha256").update(await readFile(file)).digest("hex")}  ${relative(root, file)}`));
await writeFile(join(root, "SHA256SUMS.txt"), `${lines.join("\n")}\n`, "utf8");
console.log(`Wrote checksums for ${entries.length} release artifact(s).`);
