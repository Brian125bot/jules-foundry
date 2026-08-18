# Jules Foundry Production Test Matrix

## Quality objective

The suite protects the platform’s most consequential invariants: secret non-disclosure, dispatch and polling idempotency, bounded provider interactions, deterministic evidence authority, session-control auditability, and operator confirmation before remote destructive work.

| Layer | Critical behaviors | Test style |
|---|---|---|
| Domain | DAG validity, scope quarantine, state/health labels, quality verdicts, recovery boundaries, polling policy | Pure unit tests |
| Persistence | Credential rotation, unique provider labels, initiative deletion, command idempotency, monitor checkpoint and activity uniqueness | Database-backed regression tests |
| Router safety | Ownership, state preconditions, plan and contract gates, local holds, control leases, typed destructive confirmation | Procedure/helper regression tests |
| Provider boundary | Source matching, pagination, timeout/error normalization, absence of unsupported remote controls | Adapter tests with mocked responses |
| UI control plane | Required task, fleet, initiative, quality, evidence, and Session Command Deck actions remain wired | Source-level smoke tests plus visual review |
| Release | Dependency policy, production advisory audit, type checking, coverage thresholds, production bundle, output policy, and SBOM | User-run `pnpm release:verify` |

## Completed verification

The current suite contains **19 test files and 70 tests**. It includes direct domain checks for dependency graphs, health states, evidence dossiers, Quality Mesh verdicts, prompt provenance, recovery classification, session-control policy, and Gemini model allowlisting. Database-backed router tests cover credential persistence, source discovery, dispatch failure recovery, initiative-deletion locks, local-hold idempotency, durable command records, typed deletion confirmation/state-drift safeguards, restart-safe monitor checkpoint persistence, failure retry metadata, provider activity deduplication, and initiative-scoped Gemini model persistence. Browser UI smoke tests protect the major Command Center, Fleet, Credential vault, initiative, mission, Quality Mesh, Session Command Deck, and Gemini selector bindings. Node-first regression coverage also prevents desktop-wrapper or hosted-workflow coupling from returning.

The local-hold router regression exposed an ordering defect: a repeated identical command was checked against its changed availability before its existing idempotency record. The command route now resolves the existing command after validating destructive confirmation but before state availability, so a retried identical request correctly returns its durable audit record and never repeats its side effect.

## Release gate

A change is ready to share when `pnpm release:verify` succeeds on the local machine. The current validation passed the frozen-install, dependency-policy, production-audit, TypeScript, coverage, production-build, browser-output, and SBOM stages with **70 passing Vitest tests**. The integrated Gemini selector workflow test proves that a persisted `gemini-3.6-flash` selection is confirmed against a mocked paginated provider catalog, used in the exact generation endpoint, and recorded in task-compilation audit metadata. Live-provider scenarios are separately recorded because they require real configured credentials and must never be simulated by destructive test data.
