# Granular Session Control Validation

The granular session-control implementation persists every requested control with a deterministic idempotency key, a redacted precondition snapshot, and an outcome record. A short-lived per-task control lease blocks competing in-flight commands; local holds are explicitly Foundry-only and never represent a remote Jules pause.

The reconciliation path now stores a restart-safe monitor checkpoint containing the latest activity cursor, observed provider state, response digest, latency, error streak, and an adaptive next-poll recommendation. Provider activities are indexed by their provider activity ID so a repeated reconciliation does not duplicate the mission ledger.

| Validation | Result |
|---|---|
| TypeScript | Pass |
| Vitest | 9 files, 37 tests pass |
| Production build | Pass before latest monitor hardening; type and test checks pass after it |
| Desktop mission workspace | Session Command Deck verified with provider state, local hold, freshness, audit, and state-aware controls |

> Automatic periodic reconciliation is intentionally not activated in this checkpoint. It requires a published deployment and an authenticated scheduled callback; until then, the operator-controlled **Refresh** and **Reconcile** commands perform the same idempotent checkpointed observation safely.

## Current release evidence

The current release baseline contains 13 Vitest files and 52 passing tests. Router regressions cover local-hold idempotency, typed provider deletion confirmation, provider-state drift, monitor checkpoint success/failure persistence, retry metadata, and provider activity deduplication. A real terminal Jules session was also reviewed without issuing a new provider action; its task detail showed terminal state, activity ledger, recorded poll attempts, artifacts, cost rows, and Session Command Deck context.

The persisted checkpoint, provider activity cursor, retry/error metadata, and task-level lease form the prerequisite for the planned branch-verification queue. A future verifier can reuse these durable observations to enqueue one immutable branch snapshot per terminal head SHA without adding fragile in-process polling.
