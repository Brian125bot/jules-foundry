import crypto from "node:crypto";
import { getLegacyPassphraseKey, getVaultKeyMaterial } from "./vault-key-provider";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

const CURRENT_PREFIX = "jf-v2:";

export function isCurrentVaultCiphertext(payload: string) { return payload.startsWith(CURRENT_PREFIX); }

export function encryptSecret(secret: string) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getVaultKeyMaterial().key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${CURRENT_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const current = isCurrentVaultCiphertext(payload);
  const raw = Buffer.from(current ? payload.slice(CURRENT_PREFIX.length) : payload, "base64");
  const iv = raw.subarray(0, IV_BYTES);
  const tag = raw.subarray(IV_BYTES, IV_BYTES + 16);
  const encrypted = raw.subarray(IV_BYTES + 16);
  const decipher = crypto.createDecipheriv(ALGORITHM, current ? getVaultKeyMaterial().key : getLegacyPassphraseKey(), iv);
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
