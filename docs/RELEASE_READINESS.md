# Release Readiness Controls

Jules Foundry releases are validated against a local-first operating model. The desktop service binds only to loopback, provider credentials are held in the local vault, and the built browser bundle must not include hosted analytics, remote fonts, unresolved release tokens, executable remote browser calls, or likely credential material.

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
| `pnpm desktop:config:unsigned && pnpm desktop:prepare && pnpm desktop:smoke` | Packaged local-service sidecar works with the deterministic unsigned desktop configuration. |

`pnpm release:verify` runs the complete local release gate above. It is intentionally an **unsigned artifact** validation gate. It does not replace the protected native signing workflow.

## Current implementation status

The source-level production-readiness remediation was synchronized to the GitHub-connected canonical branch in checkpoint `9332004d` on 2026-08-18. The validated unsigned gate includes a frozen dependency installation, pnpm policy verification, production dependency audit, TypeScript type check, 68 automated tests, targeted security-critical coverage thresholds, browser bundle budget validation, local-first output scanning, SBOM generation, deterministic unsigned Tauri configuration, prepared-sidecar smoke testing, and an authenticated local-runtime render check.

> A pristine pre-remediation baseline was not retained before the remediation edits began. The current checkpoint is the authoritative post-remediation baseline; its release evidence is reproducible through `pnpm release:verify`.

## Desktop configuration modes

`pnpm desktop:config:unsigned` creates an ignored Tauri configuration with updater artifacts disabled. It requires no release secrets and is the only configuration expected for local developer and clean-checkout artifact verification.

`pnpm desktop:config:signed` requires `TAURI_UPDATE_PUBLIC_KEY` and `TAURI_UPDATE_ENDPOINT`. The endpoint must be HTTPS. It creates updater-enabled configuration only for protected release CI; never run it with real release values on an untrusted workstation.

## External release prerequisites

The repository now verifies the source, local runtime, sidecar, dependency policy, and browser output. General availability still requires protected CI to complete operating-system-specific Tauri builds, installer smoke tests, code signing or notarization as appropriate, update-feed tamper rejection, and controlled live-provider contract runs using disposable resources and least-privilege credentials. These operations require organization-owned certificates, updater keys, provider credentials, and platform runners and cannot be validated from an ordinary source checkout.

The protected release environment must provide `TAURI_UPDATE_PUBLIC_KEY`, `TAURI_UPDATE_ENDPOINT`, `TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` through GitHub Actions secrets. Live provider checks must use separate least-privilege Gemini, Jules, and GitHub credentials and disposable test resources; do not use a developer workstation vault or a production repository for this validation.

## Local data integrity

Migration `0001_integrity_guards` rejects new task-graph child records that lack their initiative or task parent. Startup performs SQLite integrity checks before installing the guard migration, and Local Operations diagnostics reports SQLite integrity, foreign-key enforcement, and orphan counts. Existing applications are upgraded through an additive migration sequence; active data is never overwritten by recovery staging.
