import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { ensureLocalDirectories, LOCAL_DATA_DIR } from "./local-runtime";

const SETTINGS_PATH = join(LOCAL_DATA_DIR, "settings.json");
export const localSettingsSchema = z.object({ backupRetention: z.number().int().min(1).max(365).default(14), logRetentionDays: z.number().int().min(1).max(365).default(30), updateChannel: z.enum(["stable", "beta"]).default("stable"), updateChecksEnabled: z.boolean().default(false), onboardingCompleted: z.boolean().default(false) });
export type LocalSettings = z.infer<typeof localSettingsSchema>;

const defaults: LocalSettings = { backupRetention: 14, logRetentionDays: 30, updateChannel: "stable", updateChecksEnabled: false, onboardingCompleted: false };

export function getLocalSettings(): LocalSettings {
  ensureLocalDirectories();
  if (!existsSync(SETTINGS_PATH)) return defaults;
  try { return localSettingsSchema.parse({ ...defaults, ...JSON.parse(readFileSync(SETTINGS_PATH, "utf8")) }); }
  catch { return defaults; }
}

export function updateLocalSettings(update: Partial<LocalSettings>) {
  const value = localSettingsSchema.parse({ ...getLocalSettings(), ...update });
  writeFileSync(SETTINGS_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  return value;
}
