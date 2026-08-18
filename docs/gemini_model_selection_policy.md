# Gemini Model Selection Policy

## Purpose

Jules Foundry now lets an operator choose a **Gemini inference model** while composing an initiative. That selection applies to Foundry’s bounded Gemini work: task-graph planning, Quality Mesh contract and critic generation, terminal adversarial review, and recovery advice. It does **not** select, modify, or claim control over the remote model used internally by Google Jules.

The model catalog is deliberately allowlisted rather than accepting arbitrary text. Before any Gemini inference call, Foundry lists the models accessible to the write-only Gemini credential and verifies that the selected identifier is present and generation-capable. Google documents that model resource names are returned by `models.list` and should be used when selecting a model; the same API supports pagination for a complete catalog read.[1]

| Operator label | Provider identifier | Intended use in Foundry |
|---|---|---|
| Gemini 3.7 Flash | `gemini-3.7-flash` | Frontier workhorse for complex coding and agent workflows. |
| Gemini 3.6 Flash | `gemini-3.6-flash` | Balanced coding, reasoning, and multimodal planning. |
| Gemini 3.5 Flash | `gemini-3.5-flash` | General-purpose compatible option. |
| Gemini 3.5 Flash-Lite | `gemini-3.5-flash-lite` | Low-latency, high-throughput planning and review. |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` | Earlier compatible Flash-Lite option. |
| Gemini 2.5 Flash | `gemini-2.5-flash` | Backward-compatible default for existing initiatives. |

> **No silent fallback:** if the selected allowlisted model is unavailable to the configured Gemini credential, Foundry blocks the inference request and gives the operator an actionable error. It does not silently substitute a different model.

## Persistence and provenance

The model is persisted on the initiative with **Gemini 2.5 Flash** as the migration-safe default. Existing initiatives therefore retain their previous behavior. For new work, Foundry records the selection in the initiative summary, task-compilation event metadata, Quality Mesh contract/critic JSON, proof-prompt twin, verification deterministic record, and related audit events. This creates a reviewable model trail without exposing a credential or allowing a model choice to auto-dispatch or auto-approve a Jules session.

Google’s current Gemini model API documentation illustrates the model resource name `gemini-3.7-flash` and describes `models.list` as the source of extended model metadata and supported functionality.[1] Google’s Gemini announcements identify Gemini 3.6 Flash and Gemini 3.5 Flash-Lite as developer-facing Gemini API options, while explaining the latter’s low-latency, high-throughput role.[2]

## Operational rules

| Rule | Enforced behavior |
|---|---|
| Credential handling | The Gemini secret stays write-only in the vault and is read only server-side for catalog validation and inference. |
| Availability | The live `models.list` result is normalized, paginated, filtered for generation support, and checked before every bounded inference request. |
| Scope | The selection applies to Foundry planning and Quality Mesh calls only, never to the model behind a remote Jules session. |
| Safety | Deterministic Quality Mesh checks remain authoritative. Model output cannot auto-dispatch, approve, or redispatch work. |
| Continuity | Existing initiatives use the persisted `gemini-2.5-flash` default until an operator creates a new initiative with a different choice. |

## Verification

The release gate includes catalog allowlist and failure-closed availability tests, paginated provider-catalog tests, initiative persistence and invalid-input tests, desktop selector and task-provenance smoke checks, the full Vitest suite, TypeScript, and a production build.

## References

[1]: https://ai.google.dev/api/models "Gemini API Models reference"
[2]: https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-3-6-flash-3-5-flash-lite-3-5-flash-cyber/ "Google: Introducing Gemini 3.6 Flash, 3.5 Flash-Lite, and 3.5 Flash Cyber"
