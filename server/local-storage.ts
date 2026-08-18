import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, normalize, relative, resolve } from "node:path";
import type { Express, Request, Response } from "express";
import { LOCAL_ARTIFACT_DIR, requireLocalSession } from "./local-runtime";

function artifactPath(key: string) {
  const normalized = normalize(key).replace(/^([/\\])+/, "");
  const candidate = resolve(LOCAL_ARTIFACT_DIR, normalized);
  if (relative(LOCAL_ARTIFACT_DIR, candidate).startsWith("..")) throw new Error("Artifact path escapes local storage.");
  return candidate;
}

export async function storagePut(key: string, data: Buffer | Uint8Array | string, _contentType = "application/octet-stream") {
  const target = artifactPath(key);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await writeFile(target, data, { mode: 0o600 });
  return { key, url: `/local-artifacts/${key.split("/").map(encodeURIComponent).join("/")}` };
}

export async function storageGet(key: string) {
  const target = artifactPath(key);
  await stat(target);
  return { key, url: `/local-artifacts/${key.split("/").map(encodeURIComponent).join("/")}` };
}

export async function storageGetSignedUrl(key: string) {
  return storageGet(key);
}

export function registerLocalStorageRoutes(app: Express) {
  app.get("/local-artifacts/{*key}", requireLocalSession, async (req: Request, res: Response) => {
    try {
      const keyValue = req.params.key;
      const key = Array.isArray(keyValue) ? keyValue.join("/") : keyValue || "";
      const target = artifactPath(key);
      const metadata = await stat(target);
      if (!metadata.isFile()) throw new Error("Not a file");
      res.setHeader("Cache-Control", "no-store");
      createReadStream(target).pipe(res);
    } catch {
      res.status(404).send("Local artifact not found.");
    }
  });
}
