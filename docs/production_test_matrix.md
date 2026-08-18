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
| Release | Type checking, complete Vitest run, production bundle build | CI-style verification commands |

## Completed verification

The expanded suite currently contains **10 test files and 46 tests**. It includes direct domain checks for dependency graphs, health states, evidence dossiers, Quality Mesh verdicts, prompt provenance, recovery classification, and session-control policy. Database-backed router tests cover credential persistence, source discovery, dispatch failure recovery, initiative-deletion locks, local-hold idempotency, durable command records, typed deletion confirmation/state-drift safeguards, restart-safe monitor checkpoint persistence, failure retry metadata, and provider activity deduplication. The desktop smoke suite protects the major Command Center, Fleet, vault, initiative, mission, Quality Mesh, and Session Command Deck bindings.

The local-hold router regression exposed an ordering defect: a repeated identical command was checked against its changed availability before its existing idempotency record. The command route now resolves the existing command after validating destructive confirmation but before state availability, so a retried identical request correctly returns its durable audit record and never repeats its side effect.

## Release gate

A change is ready for release only when `pnpm check`, `pnpm test`, and `pnpm build` succeed. The current validation passed all three commands: **TypeScript passed, 44 Vitest tests passed, and the production bundle built successfully**. Live-provider scenarios are separately recorded because they require real configured credentials and must never be simulated by destructive test data.
