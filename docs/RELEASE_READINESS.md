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

## Public technical-preview staging

Use `pnpm release:stage` only from a clean, reviewed commit. It runs the local release gate, produces the direct-user archive, inspects archive contents, and stages a checksum, CycloneDX SBOM, manifest, and release notes under `release/v<version>/`. Publish those files together; a direct-user archive without its checksum and manifest is not a release artifact.

The opt-in command `RUN_LIVE_PROVIDER_CONTRACTS=1 pnpm test:providers:live` verifies disposable GitHub, Gemini, and Jules fixture access and writes a redacted transcript. It fails closed unless all required `FOUNDRY_LIVE_*` variables are provided. It does not create or modify a Jules session; separate reviewed session-lifecycle certification is required before general availability.

## Owner prerequisites before publishing

| Prerequisite | Current status | Required owner action |
|---|---|---|
| Clean release artifact | The staging command was exercised only under its explicit dirty-worktree dry-run override. Such evidence is labelled `nonpublishable-dry-run`. | Commit the reviewed source, run `pnpm release:stage` without `FOUNDRY_RELEASE_ALLOW_DIRTY`, and verify the staged checksum from its release directory. |
| Live-provider certification | The fail-closed command and redacted-transcript design are implemented. Execution was deliberately deferred without disposable credentials. | Provide least-privilege Gemini, Jules, and GitHub credentials limited to a disposable fixture repository, run the opt-in command, and retain only its redacted transcript. |
| GitHub release publication | No hosted release is created by project tooling. | Independently review the clean staged archive, checksum, SBOM, manifest, release notes, and any certification transcript before attaching them to a GitHub Release. |
| Other desktop platforms | Not in the current Linux technical-preview scope. | Complete platform-specific testing and release evidence before declaring macOS or Windows support. |

## Current implementation status

The current Node/browser validation gate includes a frozen dependency installation, pnpm policy verification, production dependency audit, TypeScript type check, automated tests, targeted security-critical coverage thresholds, browser bundle budget validation, local-first output scanning, and SBOM generation.

> A pristine pre-remediation baseline was not retained before the remediation edits began. The current Node-first implementation is the authoritative baseline; its release evidence is reproducible through `pnpm release:verify`.

## Local operation model

The supported user journey is intentionally small: clone the repository, run `pnpm install --frozen-lockfile`, and run `pnpm start`. The application compiles locally, opens the browser, and writes all operator data outside the repository. No Rust/Cargo installation, native installer, sidecar executable, code-signing certificate, updater feed, or GitHub Actions secret is required.

The project deliberately has no hosted workflow automation. Run `pnpm release:verify` locally before sharing or deploying a change. The optional provider-contract certification uses separate least-privilege credentials and disposable resources; it is not a prerequisite for an individual user to run the application locally.

## Local data integrity

Migration `0001_integrity_guards` rejects new task-graph child records that lack their initiative or task parent. Startup performs SQLite integrity checks before installing the guard migration, and Local Operations diagnostics reports SQLite integrity, foreign-key enforcement, and orphan counts. Existing applications are upgraded through an additive migration sequence; active data is never overwritten by recovery staging.
