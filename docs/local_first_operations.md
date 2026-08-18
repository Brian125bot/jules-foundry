# Jules Foundry Local-first Operations Guide

## Purpose

This guide describes the supported runtime for Jules Foundry: one local operator, one trusted machine, one local SQLite audit ledger, and server-side outbound calls only to the Gemini, Jules, and GitHub APIs. It replaces the previous hosted authentication, managed-database, hosted-storage, analytics, and scheduler assumptions.

## Runtime contract

| Area | Local-first implementation | Operator implication |
|---|---|---|
| Identity | A single seeded `Local operator` record and one-time local bootstrap capability. | There is no account registration, cloud login, or multi-user access control. |
| Browser access | `127.0.0.1` listener, strict host/origin checks, `HttpOnly` `SameSite=Strict` session cookie. | Start Foundry through its launcher; restart it to mint a new local session. |
| Audit database | SQLite in the operating-system application-data directory, WAL mode, foreign keys, full synchronous writes, versioned schema migration. | Keep the data directory on the local disk and use application backups rather than ad hoc file copying. |
| Credential vault | AES-256-GCM ciphertext using an `scrypt`-derived key from `FOUNDRY_VAULT_PASSPHRASE` plus a local random salt. | Set the passphrase before launch. It is required to use saved provider credentials after restart. |
| Artifacts | Controlled local files rooted in the Foundry application-data directory. | Artifact download requests are limited to the current local browser session. |
| Monitoring | In-process supervisor that resumes checkpointed due sessions while Foundry is running. | Monitoring pauses when the program is stopped; it does not claim cloud availability. |

## First run

Before first use, set `FOUNDRY_VAULT_PASSPHRASE` in the environment that launches Foundry. A passphrase manager or operating-system secret launcher is appropriate; do not put this value in Git, a shell history, issue tracker, or support bundle.

On first launch, Foundry creates the application-data directories, applies `drizzle-local/0000_open_khan.sql` inside a local SQLite transaction, records the migration in `__foundry_local_migrations`, and creates the immutable local operator record. A failed migration rolls back without recording the migration identifier.

## Credential recovery and rotation

Credential values remain write-only. A saved provider key can be tested, rotated, or deleted, but never read back. A local SQLite backup contains encrypted credential blobs only. If a device is replaced, the original passphrase is unavailable, or the vault is intentionally reset, re-enter provider credentials through the dashboard.

Never attempt to copy a prior hosted deployment’s encrypted credential rows into a local database. Those values were protected by different server-side key material and cannot be safely transformed into local-vault ciphertext without exposing plaintext. Migrate operational records only after creating a redacted export, then re-enter provider credentials locally.

## Backups and restore procedure

Create backups through the Credential vault control. The service uses SQLite `VACUUM INTO` so the result is consistent even when the working database has a WAL file. The service validates a backup with `PRAGMA integrity_check` before treating it as restorable.

To restore, stop Jules Foundry, preserve the current data directory as a rollback copy, validate the backup in a clean directory, then replace the stopped database atomically according to your operating-system procedure. The local restore helper deliberately stages only into a **different** database path and refuses to overwrite the active runtime database. Restart Foundry and verify the local operator, initiative count, task timeline, Quality Mesh records, and evidence dossiers before dispatching new work.

The automated restore regression creates a backup containing an executing mission and due monitor checkpoint, stages it into a fresh local data directory, reopens Foundry against that database, verifies the seeded operator and mission record, and confirms the persisted checkpoint is selected for reconciliation. This tests recoverability without exposing an in-dashboard destructive restore action.

## Local monitor lifecycle

The monitor retains the existing provider-activity deduplication, adaptive checkpoint metadata, state-aware controls, command idempotency, and short-lived task leases. It checks only sessions whose `nextRecommendedPollAt` time is due. Provider failure updates the checkpoint and task audit ledger; it does not automatically redispatch a task. A restart regression closes and reopens the local database, then proves that a due persisted checkpoint is selected for reconciliation.

An operator should use the Fleet Observatory and Session Command Deck after a restart to reconcile task state. A local-only hold is still a Foundry governance hold; it does not claim to pause Jules unless a provider-side action is explicitly requested and recorded.

## Troubleshooting

| Symptom | Resolution |
|---|---|
| Dashboard says the local session is missing | Close the direct tab and restart Foundry so its launcher can open a new one-time local browser session. |
| Credential vault reports locked | Start the process with the same `FOUNDRY_VAULT_PASSPHRASE` used to encrypt local credentials, or re-enter credentials under a new passphrase. |
| A backup is present but restore is unsafe | Do not copy it over a running database. Stop Foundry, validate integrity, keep a rollback copy, then restore. |
| A mission is stale after a restart | Reopen Foundry and reconcile. Monitoring intentionally resumes only while the local application is running. |
| A remote provider request fails | Review the masked credential profile and provider test result. Provider errors are recorded without raw authorization values. |

## Release gates

A local-first release must pass TypeScript, Vitest, production build, a fresh-database migration test, SQLite integrity check, a backup verification that opens a copied restore candidate, local-session rejection and bootstrap tests, credential ciphertext and local-storage containment tests, and restart-safe monitor checkpoint regression before publication. The canonical release command sequence is:

```bash
FOUNDRY_VAULT_PASSPHRASE="test-only-value" pnpm check
FOUNDRY_VAULT_PASSPHRASE="test-only-value" pnpm test
FOUNDRY_VAULT_PASSPHRASE="test-only-value" pnpm build
```
