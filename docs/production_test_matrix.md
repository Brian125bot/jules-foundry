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

## Release gate

A change is ready for release only when `pnpm check`, `pnpm test`, and `pnpm build` succeed. Live-provider scenarios are separately recorded because they require real configured credentials and must never be simulated by destructive test data.
