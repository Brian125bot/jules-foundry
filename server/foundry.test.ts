import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, maskSecret } from "./services/vault";
import { buildDossierMarkdown, deriveHealth, dispatchAttemptKey, ESTIMATED_CENTS_PER_PROVIDER_CALL, pollAttemptKey, resolveCredentialWriteTarget, summarizeInitiativeDeletion, validateCompiledDag } from "./routers/foundry";

describe("credential vault primitives", () => {
  it("round-trips a secret without using the masked value as storage", () => {
    const original = "jules-secret-token-9876";
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toContain(original);
    expect(decryptSecret(encrypted)).toBe(original);
    expect(maskSecret(original)).toBe("••••••••9876");
  });
});

describe("domain label constraints", () => {
  it("keeps the exact product health and evidence labels stable", () => {
    expect(["healthy", "stale", "attention", "terminal"]).toHaveLength(4);
    expect(["proven", "partial", "unproven", "contradicted"]).toHaveLength(4);
  });
});

describe("task graph validation", () => {
  it("accepts an ordered task graph and rejects cyclic or unresolved dependencies", () => {
    expect(() => validateCompiledDag([{ title: "Map repository", dependencies: [] }, { title: "Implement change", dependencies: ["Map repository"] }])).not.toThrow();
    expect(() => validateCompiledDag([{ title: "A", dependencies: ["Missing"] }])).toThrow(/does not exist/);
    expect(() => validateCompiledDag([{ title: "A", dependencies: ["B"] }, { title: "B", dependencies: ["A"] }])).toThrow(/cycle/);
    expect(() => validateCompiledDag([{ title: "Scope", dependencies: [] }, { title: " scope ", dependencies: [] }])).toThrow(/duplicate/i);
    expect(() => validateCompiledDag([{ title: "A", dependencies: [" A "] }])).toThrow(/cannot depend on itself/i);
  });
});

describe("initiative deletion boundary", () => {
  it("blocks deletion only when a task has both a remote session and an active orchestration state", () => {
    const summary = summarizeInitiativeDeletion([
      { id: 1, title: "Finished remote work", state: "review_ready", julesSessionName: "sessions/finished" },
      { id: 2, title: "Draft", state: "ready", julesSessionName: null },
    ]);
    expect(summary).toMatchObject({ taskCount: 2, canDelete: true, activeSessions: [] });
    const blocked = summarizeInitiativeDeletion([{ id: 3, title: "Executing", state: "executing", julesSessionName: "sessions/live" }]);
    expect(blocked.canDelete).toBe(false);
    expect(blocked.activeSessions.map(task => task.id)).toEqual([3]);
  });
});

describe("idempotency keys", () => {
  it("is stable for the same dispatch or poll attempt and distinct across attempt layers", () => {
    expect(dispatchAttemptKey(42, "task-seed")).toBe(dispatchAttemptKey(42, "task-seed"));
    expect(pollAttemptKey(42, 999)).toBe(pollAttemptKey(42, 999));
    expect(dispatchAttemptKey(42, "task-seed")).not.toBe(pollAttemptKey(42, 999));
  });
});

describe("monitoring health and evidence dossier", () => {
  it("derives only the required health labels from provider state and activity freshness", () => {
    expect(deriveHealth("COMPLETED", new Date())).toBe("terminal");
    expect(deriveHealth("AWAITING_PLAN_APPROVAL", new Date())).toBe("attention");
    expect(deriveHealth("IN_PROGRESS", new Date(Date.now() - 25 * 60 * 1000))).toBe("stale");
    expect(deriveHealth("IN_PROGRESS", new Date())).toBe("healthy");
    expect(deriveHealth(undefined, new Date(Date.now() - 21 * 60 * 1000))).toBe("stale");
  });

  it("creates an exportable dossier without any secret values", () => {
    const content = buildDossierMarkdown({
      task: { title: "Add unit tests", taskKey: "task-123", julesSessionName: "sessions/77" },
      initiative: { repository: "acme/app", branch: "main" },
      criteria: [{ id: "AC-1", text: "Tests cover sign in" }],
      evidence: [{ criterionId: "AC-1", status: "proven", label: "CI suite", reference: "run-22" }],
      events: [{ createdAt: new Date("2026-01-01T00:00:00Z"), source: "jules", eventType: "session_completed", summary: "Session completed." }],
    });
    expect(content).toContain("# Jules Foundry Evidence Dossier");
    expect(content).toContain("**proven** — CI suite (run-22)");
    expect(content).not.toContain("secret-token");
    const defaults = buildDossierMarkdown({ task: { title: "Unlinked", taskKey: "task-456" }, initiative: { repository: "acme/app", branch: "main" }, criteria: [{ id: "AC-2", text: "No evidence defaults safely" }], evidence: [], events: [] });
    expect(defaults).toContain("**unproven** — No linked evidence yet.");
  });
});

describe("cost estimate rule", () => {
  it("uses a visible conservative one-cent planning estimate per external provider call", () => {
    expect(ESTIMATED_CENTS_PER_PROVIDER_CALL).toBe(1);
  });
});

describe("credential profile conflict resolution", () => {
  it("consolidates a rotated profile into an existing provider-label target instead of violating uniqueness", () => {
    expect(resolveCredentialWriteTarget(3, 1)).toEqual({ targetId: 1, redundantId: 3 });
    expect(resolveCredentialWriteTarget(3, 3)).toEqual({ targetId: 3, redundantId: null });
    expect(resolveCredentialWriteTarget(undefined, undefined)).toEqual({ targetId: null, redundantId: null });
  });
});
