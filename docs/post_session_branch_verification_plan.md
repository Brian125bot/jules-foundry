# Post-Session Branch Verification Plan

## Objective

Jules Foundry should treat a terminal Jules session as the start of verification, not as proof of success. The proposed verifier will inspect the branch or pull request created by the session, gather immutable GitHub and Jules evidence, apply deterministic checks, and use bounded Gemini evaluators only to map evidence and search for contradictions.

> **Jules completion is an observation. Foundry acceptance is an evidence-backed decision.**

## Trigger and execution model

The primary completion detector should extend the existing restart-safe session reconciliation flow. A terminal state transition, newly discovered pull request, or changed remote head SHA creates an idempotent verification job. The job key includes the task ID, Jules terminal revision, remote head SHA, verification-policy version, and check-recipe digest. A manual **Verify branch** action remains available as an operator fallback.

| Option | Use | Limitation |
|---|---|---|
| Durable reconciliation plus verification queue | Recommended default; works when a session is polled and recovers after restarts. | Verification begins on the next bounded reconciliation window. |
| Provider callback plus the same queue | Future acceleration path if a signed, documented completion callback is available. | Must retain reconciliation as a fallback and defend against replay. |
| Manual verification only | Useful for controlled review and troubleshooting. | Does not provide automated terminal coverage. |

## Immutable verification snapshot

Before any check runs, Foundry records the immutable branch context shown below. All verdicts, evidence, and retries attach to this snapshot rather than an unpinned branch name.

| Evidence | Authoritative source | Verification use |
|---|---|---|
| Session state, activities, plan, messages, artifacts | Jules API | Establishes provider-reported lifecycle and outputs. |
| Base ref/SHA, head ref/SHA, merge base, changed-file inventory | GitHub API | Pins the code revision and enforces allowed-path policy. |
| Pull request, review, CI/check-run, mergeability data | GitHub API | Supplies external implementation and integration evidence. |
| Contract, task twin, prompt digest, selected Gemini model | Foundry records | Compares actual work with the exact operator-approved request. |

## Three-lens verdict process

The deterministic lens runs first. It checks changed paths, protected paths, required artifacts, repository status, and available CI or recipe checks. Its failures can directly block acceptance. The evidence lens maps activities, diff facts, PR data, and check outputs to each acceptance criterion using the existing `proven`, `partial`, `unproven`, and `contradicted` labels. The adversarial lens receives only the bounded snapshot and criterion map; it searches for omissions, scope creep, regressions, and false proof.

| Final verdict | Rule |
|---|---|
| `accepted` | Every blocking criterion is proven and all deterministic integration checks pass. |
| `conditionally_accepted` | The main outcome is proven, with non-blocking evidence debt requiring acknowledgement. |
| `failed_verification` | A deterministic check or a blocking criterion contradicts the contract. |
| `needs_human_review` | Evidence is ambiguous, missing, or policy-sensitive. |
| `provider_failed` | The Jules provider failed or cannot be reconciled into a trustworthy snapshot. |

Gemini does not override deterministic failures, approve a PR, merge code, dispatch Jules, or create an uncontrolled retry. All model calls are structured, redacted, bounded, and persist their selected model, input digest, evidence references, template version, and output schema outcome.

## Data model and operator controls

Add durable verification jobs, immutable branch snapshots, deterministic check runs, criterion verdicts, and recovery briefs. Jobs receive short-lived leases, bounded retry budgets, and an explicit next-attempt time. A newer head SHA creates a new snapshot and job rather than mutating an old verdict.

Task Detail should gain a **Branch Verification** workspace with the head SHA, base SHA, changed-file policy, PR and CI status, deterministic checks, criterion proof map, selected Gemini model/version, contradictions, and Recovery Brief. Operators can verify now, retry a classified transient failure, acknowledge a conditional result, or open recovery review. Auto-merge and auto-redispatch remain out of scope.

## Security and rollout

GitHub access for verification must be read-only. Do not execute untrusted branch code inside the Foundry application process. If repository recipes later need execution, run them in an isolated ephemeral runner pinned to the recorded SHA, with no vault secrets, strict resource/output limits, network restrictions where practical, and destructive commands disallowed. Treat repository text, commit messages, PR descriptions, logs, and Jules activity text as untrusted data, never as instructions.

Roll out in stages: first snapshot and display evidence in manual mode; then deterministic diff, PR, and check-run verification; then bounded Gemini evidence/adversarial evaluators; then a durable reconciliation-driven queue; and finally initiative-level integration checks and recovery briefs. Calibrate policy thresholds against sanitized historical runs before enabling any new automation.

## Test matrix

The verification feature requires unit tests for snapshot keys, redaction, policy gates, verdict roll-up, and retry budgets; adapter tests for pagination, missing PRs, check states, and GitHub errors; queue tests for deduplication and leases; UI tests for all verdict and disabled-control states; and non-production trials covering success, failed tests, out-of-scope diff, missing CI, stale provider data, and initiative closeout.

## References

[1]: https://developers.google.com/jules/api "Jules API documentation"
[2]: https://jules.google/docs/api/reference/sessions/ "Jules Sessions API reference"
[3]: https://jules.google/docs/api/reference/activities/ "Jules Activities API reference"
[4]: https://ai.google.dev/api/models "Gemini Models API reference"
