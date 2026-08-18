import { eq } from "drizzle-orm";
import { credentialProfiles } from "../../drizzle/schema";
import { getDb } from "../db";
import { decryptSecret, encryptSecret, isCurrentVaultCiphertext } from "./vault";

/** Re-encrypts legacy passphrase ciphertext in-place without returning raw secrets. */
export async function migrateLegacyVaultCiphertexts() {
  const db = await getDb();
  const profiles = await db.select().from(credentialProfiles);
  let migrated = 0;
  for (const profile of profiles) {
    if (isCurrentVaultCiphertext(profile.encryptedSecret)) continue;
    const raw = decryptSecret(profile.encryptedSecret);
    await db.update(credentialProfiles).set({ encryptedSecret: encryptSecret(raw), version: profile.version + 1 }).where(eq(credentialProfiles.id, profile.id));
    migrated += 1;
  }
  return migrated;
}
