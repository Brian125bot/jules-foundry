import { describe, expect, it } from "vitest";
import { digestPayload } from "./services/vault";
import { buildDeterministicProofMap, buildProofCarryingPrompt, classifyRecovery, deriveInitiativeQualityVerdict, deriveQualityVerdict } from "./services/quality";

describe("Quality Mesh core", () => {
  it("does not accept contradictory or unproven blocking criteria", () => {
    expect(deriveQualityVerdict({ deterministicPassed: true, criteria: [{ status: "contradicted" }] })).toBe("failed_verification");
    expect(deriveQualityVerdict({ deterministicPassed: true, criteria: [{ status: "unproven" }] })).toBe("needs_human_review");
  });
  it("classifies scope and provider recovery without uncontrolled retry", () => {
    expect(classifyRecovery({ deterministicPassed: true, outOfScope: true }).domain).toBe("scope");
    expect(classifyRecovery({ providerFailed: true, deterministicPassed: true }).autoRetryEligible).toBe(1);
  });
  it("builds a prompt with proof requirements", () => {
    expect(buildProofCarryingPrompt({ title: "T", description: "D", allowedPaths: ["README.md"], nonGoals: ["No code"], acceptanceCriteria: [{ id: "AC-1", text: "Readable" }] })).toContain("AC-1: Readable");
  });
  it("rolls up the most conservative initiative verdict", () => {
    expect(deriveInitiativeQualityVerdict({ taskCount: 2, verdicts: ["accepted", "accepted"] })).toBe("accepted");
    expect(deriveInitiativeQualityVerdict({ taskCount: 2, verdicts: ["accepted", "needs_human_review"] })).toBe("needs_human_review");
    expect(deriveInitiativeQualityVerdict({ taskCount: 2, verdicts: ["accepted", "failed_verification"] })).toBe("failed_verification");
    expect(deriveInitiativeQualityVerdict({ taskCount: 2, verdicts: ["accepted"] })).toBe("conditionally_accepted");
  });
  it("versions prompt provenance whenever task constraints change", () => {
    const base = { promptText: buildProofCarryingPrompt({ title: "T", description: "D", allowedPaths: ["README.md"], nonGoals: ["No code"], acceptanceCriteria: [{ id: "AC-1", text: "Readable" }] }), twin: { taskKey: "task", allowedPaths: ["README.md"] } };
    const changed = { ...base, twin: { ...base.twin, allowedPaths: ["README.md", "docs/README.md"] } };
    expect(digestPayload(base)).not.toBe(digestPayload(changed));
    expect(digestPayload(base)).toBe(digestPayload(base));
  });
  it("keeps missing terminal evidence unproven and requires human review", () => {
    const proofMap = buildDeterministicProofMap({ criteria: [{ id: "AC-1", text: "One" }, { id: "AC-2", text: "Two" }], evidence: [{ criterionId: "AC-1", status: "proven" }] });
    expect(proofMap).toMatchObject([{ id: "AC-1", status: "proven", evidenceCount: 1 }, { id: "AC-2", status: "unproven", evidenceCount: 0 }]);
    expect(deriveQualityVerdict({ deterministicPassed: true, criteria: proofMap })).toBe("needs_human_review");
  });
  it("keeps implementation and ambiguity recovery recommendations non-automatic", () => {
    expect(classifyRecovery({ deterministicPassed: false })).toMatchObject({ domain: "implementation", autoRetryEligible: 0 });
    expect(classifyRecovery({ deterministicPassed: true, ambiguityScore: 75 })).toMatchObject({ domain: "contract", autoRetryEligible: 0 });
  });
});
