# Release Readiness Controls

Jules Foundry is a Node-based local web application. Its local service binds only to loopback, provider credentials are held in the local vault, and the built browser bundle must not include hosted analytics, remote fonts, unresolved release tokens, executable remote browser calls, or likely credential material. A standard Node 22 and pnpm 10 installation is the only supported runtime prerequisite.

## Required validation sequence

Run the following commands from a clean checkout using the pinned pnpm version declared in `package.json`.

| Command | Control validated |
|---|---|
| `pnpm install --frozen-lockfile` | Dependency graph and workspace policy are reproducible. |
| `pnpm release:policy` | The effective pnpm version, override policy, patched dependency, and native-build allowlist are present. |
| `pnpm release:audit` | Production dependency tree has no known high-severity advisory. |
| `pnpm check` | TypeScript contracts compile without error. |
| `FOUNDRY_VAULT_MODE=passphrase FOUNDRY_VAULT_PASSPHRASE=<test-only> pnpm test:coverage` | Tests and targeted security-critical coverage thresholds pass. |
| `pnpm build && pnpm build:check-bundle && pnpm build:verify-output` | The production bundle meets budget and local-first output policy. |

`pnpm release:verify` runs the complete Node/browser release gate above. `pnpm start` then builds and opens the same local application in the default browser.

## Current implementation status

The current Node/browser validation gate includes a frozen dependency installation, pnpm policy verification, production dependency audit, TypeScript type check, automated tests, targeted security-critical coverage thresholds, browser bundle budget validation, local-first output scanning, and SBOM generation.

> A pristine pre-remediation baseline was not retained before the remediation edits began. The current Node-first implementation is the authoritative baseline; its release evidence is reproducible through `pnpm release:verify`.

## Local operation model

The supported user journey is intentionally small: clone the repository, run `pnpm install --frozen-lockfile`, and run `pnpm start`. The application compiles locally, opens the browser, and writes all operator data outside the repository. No Rust/Cargo installation, native installer, sidecar executable, code-signing certificate, updater feed, or GitHub Actions secret is required.

Continuous integration validates the same Node/browser workflow on pull requests and `main`. Provider contract tests, if later introduced, must use separate least-privilege credentials and disposable resources; they are not a prerequisite for a user to run the application locally.

## Local data integrity

Migration `0001_integrity_guards` rejects new task-graph child records that lack their initiative or task parent. Startup performs SQLite integrity checks before installing the guard migration, and Local Operations diagnostics reports SQLite integrity, foreign-key enforcement, and orphan counts. Existing applications are upgraded through an additive migration sequence; active data is never overwritten by recovery staging.
