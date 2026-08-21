import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const version = packageJson.version;
const releaseRoot = join(root, "release", `v${version}`);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });
const sha256 = async path => createHash("sha256").update(await readFile(path)).digest("hex");

const worktreeStatus = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
const dirtyTree = Boolean(worktreeStatus);
if (process.env.FOUNDRY_RELEASE_ALLOW_DIRTY !== "true" && dirtyTree) {
  throw new Error("Refusing to stage a release from a dirty working tree. Commit changes or set FOUNDRY_RELEASE_ALLOW_DIRTY=true for an explicitly non-release dry run.");
}

run("pnpm", ["release:verify"]);
run("pnpm", ["local:bundle"]);
run("node", ["scripts/generate-sbom.mjs"]);

const archives = (await readdir(join(root, "local-release"))).filter(name => name.endsWith(".tar.gz"));
if (archives.length !== 1) throw new Error(`Expected exactly one direct-user archive, found ${archives.length}. Clear local-release before staging.`);
const archiveName = archives[0];
const archivePath = join(root, "local-release", archiveName);
run("node", ["scripts/verify-local-release-archive.mjs", archivePath]);

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(releaseRoot, { recursive: true });
const stagedArchive = join(releaseRoot, archiveName);
const stagedSbom = join(releaseRoot, `jules-foundry-${version}.sbom.cdx.json`);
await cp(archivePath, stagedArchive);
await cp(join(root, "release", "sbom.cdx.json"), stagedSbom);

const archiveDigest = await sha256(stagedArchive);
const sbomDigest = await sha256(stagedSbom);
await writeFile(`${stagedArchive}.sha256`, `${archiveDigest}  ${archiveName}\n`);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const target = archiveName.replace(/^jules-foundry-local-/, "").replace(/\.tar\.gz$/, "").replace(`${version}-`, "");
const manifest = {
  schemaVersion: 1,
  application: { name: packageJson.name, version },
  source: { commit, dirtyTree },
  build: { node: process.version, pnpm: execFileSync("pnpm", ["--version"], { cwd: root, encoding: "utf8" }).trim(), target, createdAt: new Date().toISOString(), releaseGate: "pnpm release:verify" },
  artifacts: [
    { file: archiveName, bytes: (await stat(stagedArchive)).size, sha256: archiveDigest, kind: "direct-user-bundle" },
    { file: `${stagedArchive.split("/").pop()}.sha256`, sha256: await sha256(`${stagedArchive}.sha256`), kind: "checksum" },
    { file: stagedSbom.split("/").pop(), bytes: (await stat(stagedSbom)).size, sha256: sbomDigest, kind: "sbom" },
  ],
  releaseClass: dirtyTree ? "nonpublishable-dry-run" : "technical-preview",
  requiredReview: ["release owner", "independent artifact reviewer"],
};
await writeFile(join(releaseRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
const releaseLabel = dirtyTree ? "NONPUBLISHABLE dry run" : "technical preview";
const publishWarning = dirtyTree ? "\n\n## Publication status\n\n**Do not publish this artifact.** It was staged from a dirty worktree under the explicit dry-run override and is identified as such in the manifest.\n" : "";
const notes = `# Jules Foundry v${version} ${releaseLabel}\n\n## Supported target\n\n${target}. Install Node.js 22, extract the archive, and run \`node start-local.mjs\`.\n\n## Verification\n\nFrom the directory containing the downloaded release files, verify the archive before extraction:\n\n\`\`\`bash\nsha256sum -c ${archiveName}.sha256\n\`\`\`\n\nReview \`manifest.json\` and the included CycloneDX SBOM before use. This is a single-operator, loopback-only local tool; do not expose it through a tunnel, reverse proxy, or shared host.\n\n## Known limitations\n\nThis release requires user-provided provider credentials and has not completed the opt-in live-provider contract certification unless a separately published redacted transcript is attached.${publishWarning}`;
await writeFile(join(releaseRoot, "RELEASE_NOTES.md"), notes);
console.log(`Staged ${releaseLabel} evidence in ${releaseRoot}.${dirtyTree ? " Do not publish a dirty-worktree dry run." : " Publish its archive, checksum, SBOM, manifest, and release notes together."}`);
