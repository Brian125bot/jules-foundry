import { afterEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { credentialProfiles } from "../drizzle/schema";
import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const testUserId = 987654321;
const tokenPrefix = `vault-regression-${Date.now()}`;

function context(): TrpcContext {
  return {
    user: {
      id: testUserId,
      openId: "vault-regression-user",
      name: "Vault regression user",
      email: null,
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as TrpcContext["res"],
  };
}

afterEach(async () => {
  const db = await getDb();
  if (db) await db.delete(credentialProfiles).where(eq(credentialProfiles.userId, testUserId));
});

describe("credential persistence", () => {
  it("creates, duplicate-upserts, and consolidates provider-label profiles without returning secret values", async () => {
    const db = await getDb();
    if (!db) return;
    const caller = appRouter.createCaller(context());
    const targetLabel = `${tokenPrefix}-target`;
    const sourceLabel = `${tokenPrefix}-source`;

    const first = await caller.foundry.credentials.save({ provider: "jules", label: targetLabel, secret: "vault-test-secret-one" });
    const repeated = await caller.foundry.credentials.save({ provider: "jules", label: targetLabel, secret: "vault-test-secret-two" });
    const source = await caller.foundry.credentials.save({ provider: "jules", label: sourceLabel, secret: "vault-test-secret-three" });
    const rotated = await caller.foundry.credentials.save({ credentialId: source.id, provider: "jules", label: targetLabel, secret: "vault-test-secret-four" });
    const profiles = await caller.foundry.credentials.list();
    const rows = await db.select().from(credentialProfiles).where(and(eq(credentialProfiles.userId, testUserId), eq(credentialProfiles.provider, "jules")));

    expect(first.updated).toBe(false);
    expect(repeated).toMatchObject({ id: first.id, updated: true });
    expect(rotated).toMatchObject({ id: first.id, updated: true, consolidated: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first.id);
    expect(rows[0]?.version).toBe(3);
    expect(profiles[0]).not.toHaveProperty("encryptedSecret");
    expect(profiles[0]?.maskedSecret).toMatch(/^••••••••/);
    expect(JSON.stringify(profiles)).not.toContain("vault-test-secret-four");
  });
});
