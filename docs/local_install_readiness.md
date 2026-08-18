# Local Installation Readiness Assessment

**Assessment date:** 2026-08-18  
**Scope:** Trusted-machine local-first edition of Jules Foundry

## Decision

Jules Foundry is **functionally capable of local operation now**. The local service initializes its own SQLite audit ledger, binds only to `127.0.0.1`, launches a one-time local browser capability, retains the single `Local operator` identity, protects provider secrets with the local vault, serves controlled local artifacts, and resumes due Jules-monitor checkpoints while the application is running.

This is a **developer-ready local application**. It is not yet a finished mass-distribution desktop product because installation still assumes a supported Node.js and pnpm environment, a launch-time vault passphrase, and an operator who follows the manual backup and restore procedure.

## Verified evidence

| Verification | Result | Evidence |
|---|---|---|
| TypeScript | Passed | `pnpm check` completed without errors. |
| Regression suite | Passed | 15 Vitest files and 58 tests passed. |
| Production build | Passed | Browser bundle and Node service bundle were produced successfully. |
| Fresh runtime startup | Passed | A production-mode process using a fresh temporary data directory initialized SQLite, bound to `127.0.0.1:32415`, and returned HTTP 200. |
| Local authentication boundary | Covered | Regression tests cover absent-session rejection and one-time bootstrap exchange to an `HttpOnly`, `SameSite=Strict` cookie. |
| Data recovery | Covered | Tests create a backup, stage it into a fresh runtime path, reopen the database, and verify the seeded operator, persisted mission, and due monitor checkpoint. |
| Hosted dependency removal | Audited | Active source, package, and build configuration no longer reference hosted OAuth, analytics, Forge storage, managed database configuration, storage proxy, scheduler, or platform runtime plugin. See [dependency audit](local_runtime_dependency_audit.md). |

## Functionality retained locally

The local-first runtime preserves the product’s intended operational behavior. Gemini continues to compile and assess bounded task graphs; GitHub continues to validate source and branches; Jules continues to receive dispatches and return session activity; Quality Mesh remains deterministic-first and operator-gated; task events, attempts, evidence, approvals, leases, idempotency controls, dossier exports, and recovery classifications remain durable in local SQLite.

The product is not offline: Gemini, Google Jules, and GitHub are intended outbound providers. Their credentials remain write-only after submission and provider calls originate only from the local service, not the browser.

## Remaining remediation before broad end-user distribution

| Priority | Remediation | Why it remains | Recommended delivery |
|---|---|---|---|
| High | Native installer or desktop shell | Users currently need Node.js, pnpm, and a controlled launch environment. | Package the proven loopback service with Tauri or an equivalent signed desktop wrapper. |
| High | OS keychain integration | The working vault uses a required launch-time `FOUNDRY_VAULT_PASSPHRASE`. | Store a random vault data-encryption key in macOS Keychain, Windows Credential Manager, and a supported Linux secret service, with passphrase fallback. |
| High | Single-instance lock | Two processes should not open the same SQLite data directory. | Add an operating-system mutex or atomic lock file with stale-lock recovery before start-up. |
| Medium | Guided backup and restore workflow | The implementation safely stages a restore and refuses to overwrite the active database, but recovery is not yet a dashboard wizard. | Add explicit backup browser, validate, stop, stage, confirm, and restart steps without ever revealing secrets. |
| Medium | Signed updates and release channel | Distribution needs integrity and predictable upgrades. | Code-sign installers, publish release notes and checksums, and provide opt-in update channels. |
| Medium | Supported-platform test matrix | The local runtime has been validated in Linux sandbox production mode. | Run clean-machine install, launch, vault, backup, restore, provider, and uninstall tests on supported Windows, macOS, and Linux versions. |
| Medium | Redacted diagnostic bundle | Support troubleshooting must not leak credentials or local bootstrap data. | Provide an opt-in support archive that includes version, health, migration, and redacted provider errors only. |
| Low | Client bundle splitting | The current browser bundle is approximately 929 kB before gzip. | Split infrequent detail and administration routes before wide distribution. |

## Remaining operator validations

Two interactive validations are intentionally outstanding. First, an operator must run the local launcher on the target machine and confirm the one-time browser capability reaches the seeded `Local operator` dashboard. Second, an operator must test the initiative deletion dialog on desktop and mobile with an active Jules session to confirm typed confirmation works and the active-session lock rejects deletion.

These checks do not change the core local runtime decision. They are release-readiness evidence for the final user-facing workflows.

## Recommended path

Use the current edition for a technically capable, trusted-machine installation operated by a developer or advanced user. Complete the two interactive validations, then prioritize an OS-integrated desktop wrapper, keychain vault key, and single-instance lock before offering it as a general end-user installer.
