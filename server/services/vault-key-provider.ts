import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Entry } from "@napi-rs/keyring";
import { join } from "node:path";
import { ensureLocalDirectories, LOCAL_DATA_DIR } from "../local-runtime";

export type VaultKeyMode = "os_keychain" | "passphrase" | "locked";
export type VaultKeyMaterial = { key: Buffer; mode: Exclude<VaultKeyMode, "locked">; version: "v2" };

const SERVICE = "Jules Foundry";
const ACCOUNT = "local-vault-key-v2";
const KEY_BYTES = 32;

function passphrase() {
  return process.env.FOUNDRY_VAULT_PASSPHRASE || (process.env.NODE_ENV === "test" ? "jules-foundry-test-vault-passphrase" : "");
}

function passphraseKey(value: string) {
  ensureLocalDirectories();
  const saltPath = join(LOCAL_DATA_DIR, "vault.salt");
  const salt = existsSync(saltPath) ? readFileSync(saltPath) : crypto.randomBytes(16);
  if (!existsSync(saltPath)) writeFileSync(saltPath, salt, { mode: 0o600 });
  return crypto.scryptSync(value, salt, KEY_BYTES, { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

function keychainKey() {
  const entry = new Entry(SERVICE, ACCOUNT);
  const existing = entry.getPassword();
  if (existing) {
    const key = Buffer.from(existing, "base64url");
    if (key.length !== KEY_BYTES) throw new Error("The local OS vault entry has an invalid Jules Foundry key length.");
    return key;
  }
  const key = crypto.randomBytes(KEY_BYTES);
  entry.setPassword(key.toString("base64url"));
  return key;
}

export function getVaultKeyMaterial(): VaultKeyMaterial {
  const requestedMode = process.env.FOUNDRY_VAULT_MODE || "os_keychain";
  const recoveryPassphrase = passphrase();
  if (requestedMode !== "passphrase") {
    try { return { key: keychainKey(), mode: "os_keychain", version: "v2" }; }
    catch (error) {
      if (!recoveryPassphrase) throw new Error("Credential vault is locked. OS secure storage is unavailable; set FOUNDRY_VAULT_PASSPHRASE for the local passphrase fallback.", { cause: error });
    }
  }
  if (!recoveryPassphrase) throw new Error("Credential vault is locked. Configure OS secure storage or set FOUNDRY_VAULT_PASSPHRASE for the local passphrase fallback.");
  return { key: passphraseKey(recoveryPassphrase), mode: "passphrase", version: "v2" };
}

export function getVaultKeyStatus() {
  try {
    const material = getVaultKeyMaterial();
    return { available: true, mode: material.mode, recoveryPassphraseConfigured: Boolean(passphrase()), version: material.version, message: material.mode === "os_keychain" ? "The vault encryption key is stored in this operating system account's secure credential store." : "The vault is using the configured local passphrase fallback." };
  } catch (error) {
    return { available: false, mode: "locked" as const, recoveryPassphraseConfigured: Boolean(passphrase()), version: "v2" as const, message: error instanceof Error ? error.message : "The local vault is unavailable." };
  }
}

/** Legacy V1 ciphertext is only derivable from the passphrase and existing salt. */
export function getLegacyPassphraseKey() {
  const value = passphrase();
  if (!value) throw new Error("A passphrase is required to migrate legacy local credential ciphertext.");
  return passphraseKey(value);
}
