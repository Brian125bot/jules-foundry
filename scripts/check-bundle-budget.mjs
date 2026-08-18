import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const assetDirectory = "dist/public/assets";
const budget = Number(process.env.FOUNDRY_INITIAL_BUNDLE_BUDGET_BYTES || 560 * 1024);
const files = (await readdir(assetDirectory)).filter(file => file.endsWith(".js"));
const chunks = await Promise.all(files.map(async file => ({ file, size: (await stat(join(assetDirectory, file))).size })));
const largest = chunks.sort((left, right) => right.size - left.size)[0];
if (!largest) throw new Error("No built JavaScript chunks were found for bundle-budget validation.");
if (largest.size > budget) throw new Error(`Largest browser chunk ${largest.file} is ${largest.size} bytes, exceeding the ${budget}-byte local-user budget.`);
console.log(`Largest browser chunk ${largest.file}: ${largest.size} bytes (budget ${budget}).`);
