import { describe, expect, it } from "vitest";
import { buildProofCarryingPrompt, classifyRecovery, deriveQualityVerdict } from "./services/quality";

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
});
