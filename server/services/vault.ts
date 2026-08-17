import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function vaultKey() {
  const source = process.env.JWT_SECRET;
  if (!source) throw new Error("Credential vault is unavailable because the server secret is missing.");
  return crypto.createHash("sha256").update(source).digest();
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
