export type CriterionStatus = "proven" | "partial" | "unproven" | "contradicted";
export type QualityVerdict = "accepted" | "conditionally_accepted" | "failed_verification" | "needs_human_review" | "provider_failed";
export type RecoveryDomain = "contract" | "prompt" | "scope" | "environment" | "implementation" | "provider_uncertainty";
export type QualityContractDecision = "draft" | "approved" | "revise" | "human_review";

/** A contract gates a dispatch only after a Quality Mesh contract exists; operator dispatch remains separate. */
export function canDispatchWithQualityContract(decision?: QualityContractDecision | null) {
  return !decision || decision === "approved";
}

/** Quality verification is intentionally deferred until Jules is terminal or the task is explicitly in local review. */
export function isQualityVerificationEligible(input: { julesState?: string | null; taskState?: string | null }) {
  return input.taskState === "review_ready" || input.julesState === "COMPLETED" || input.julesState === "FAILED";
}

export function buildDeterministicProofMap(input: { criteria: Array<{ id: string; text: string }>; evidence: Array<{ criterionId: string; status: CriterionStatus }> }) {
  return input.criteria.map(criterion => {
    const linked = input.evidence.filter(item => item.criterionId === criterion.id);
    const states = linked.map(item => item.status);
    const status: CriterionStatus = states.includes("contradicted") ? "contradicted" : states.includes("proven") ? "proven" : states.includes("partial") ? "partial" : "unproven";
    return { ...criterion, status, blocking: true, evidenceCount: linked.length };
  });
}

export function deriveQualityVerdict(input: { providerFailed?: boolean; deterministicPassed: boolean; criteria: Array<{ status: CriterionStatus; blocking?: boolean }>; adversarialMaterialFinding?: boolean }): QualityVerdict {
  if (input.providerFailed) return "provider_failed";
  if (!input.deterministicPassed || input.criteria.some(item => item.blocking !== false && item.status === "contradicted")) return "failed_verification";
  if (input.adversarialMaterialFinding || input.criteria.some(item => item.blocking !== false && item.status === "unproven")) return "needs_human_review";
  if (input.criteria.some(item => item.status === "partial" || item.status === "unproven")) return "conditionally_accepted";
  return "accepted";
}

export function deriveInitiativeQualityVerdict(input: { taskCount: number; verdicts: Array<QualityVerdict | undefined> }): Exclude<QualityVerdict, "provider_failed"> {
  if (input.verdicts.includes("failed_verification")) return "failed_verification";
  if (input.verdicts.includes("needs_human_review") || input.verdicts.includes("provider_failed")) return "needs_human_review";
  if (input.taskCount > 0 && input.verdicts.length === input.taskCount && input.verdicts.every(verdict => verdict === "accepted")) return "accepted";
  return "conditionally_accepted";
}

export function classifyRecovery(input: { providerFailed?: boolean; deterministicPassed: boolean; outOfScope?: boolean; ambiguityScore?: number; failureText?: string }) {
  const message = (input.failureText ?? "").toLowerCase();
  if (input.providerFailed || /timeout|rate limit|unavailable/.test(message)) return { domain: "provider_uncertainty" as RecoveryDomain, autoRetryEligible: 1, recommendation: "Reconcile provider state before retrying. Retry only if the prior remote effect is known to be absent." };
  if (input.outOfScope) return { domain: "scope" as RecoveryDomain, autoRetryEligible: 0, recommendation: "Request an explicit allowed-path decision; do not widen task scope automatically." };
  if ((input.ambiguityScore ?? 0) >= 60) return { domain: "contract" as RecoveryDomain, autoRetryEligible: 0, recommendation: "Clarify or revise the acceptance contract before creating a replacement dispatch." };
  if (!input.deterministicPassed) return { domain: "implementation" as RecoveryDomain, autoRetryEligible: 0, recommendation: "Create a narrow corrective task with the failed deterministic evidence attached." };
  return { domain: "prompt" as RecoveryDomain, autoRetryEligible: 0, recommendation: "Revise the prompt or plan constraints and require a new plan review before redispatch." };
}

export function buildProofCarryingPrompt(input: { title: string; description: string; allowedPaths: string[]; nonGoals: string[]; acceptanceCriteria: Array<{ id: string; text: string }> }) {
  return [`Mission: ${input.title}`, input.description, `Allowed paths: ${input.allowedPaths.join(", ")}`, `Non-goals: ${input.nonGoals.join("; ")}`, "Acceptance contract:", ...input.acceptanceCriteria.map(item => `${item.id}: ${item.text}`), "Report each material change and verification result against the matching acceptance criterion. Ask for feedback rather than guessing when scope conflicts with this contract."].join("\n");
}
