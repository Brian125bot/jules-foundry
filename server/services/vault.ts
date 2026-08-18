import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ensureLocalDirectories, LOCAL_DATA_DIR } from "../local-runtime";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function vaultKey() {
  const passphrase = process.env.FOUNDRY_VAULT_PASSPHRASE || (process.env.NODE_ENV === "test" ? "jules-foundry-test-vault-passphrase" : "");
  if (!passphrase) throw new Error("Credential vault is locked. Start Jules Foundry with FOUNDRY_VAULT_PASSPHRASE set in the local process environment.");
  ensureLocalDirectories();
  const saltPath = join(LOCAL_DATA_DIR, "vault.salt");
  const salt = existsSync(saltPath) ? readFileSync(saltPath) : crypto.randomBytes(16);
  if (!existsSync(saltPath)) writeFileSync(saltPath, salt, { mode: 0o600 });
  return crypto.scryptSync(passphrase, salt, 32, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function encryptSecret(secret: string) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, vaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const encrypted = raw.subarray(IV_BYTES + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, vaultKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskSecret(secret: string) {
  const suffix = secret.trim().slice(-4);
  return `••••••••${suffix || "••••"}`;
}

export function digestPayload(value: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
