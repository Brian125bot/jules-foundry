# Local Runtime Dependency Audit

**Audit date:** 2026-08-18

## Scope

The audit reviewed executable TypeScript and TSX source files, the package manifest, and Vite configuration for active dependencies on hosted identity, analytics, Forge APIs, managed database configuration, storage proxying, platform scheduling, and Manus runtime plugins.

The review searched for `VITE_ANALYTICS`, `BUILT_IN_FORGE`, `OAUTH_SERVER`, `VITE_OAUTH`, `VITE_APP_ID`, `OWNER_OPEN_ID`, `DATABASE_URL`, `forge.manus`, `api.manus`, `manus-storage`, `vite-plugin-manus`, OAuth registration, storage registration, and heartbeat scheduling references. No active source, build, or package references remained. The only ordinary use of the word “heartbeat” was product copy describing mission freshness; it does not call a hosted scheduler.

| Removed boundary | Local-first replacement | Verification point |
|---|---|---|
| OAuth callback, remote account synchronization, and platform session SDK | One-time loopback bootstrap capability, strict local cookie, seeded `Local operator` | `server/local-runtime.ts`, `server/_core/context.ts`, `server/local-runtime.test.ts` |
| Managed MySQL/TiDB and `DATABASE_URL` | File-backed local libSQL/SQLite client, generated SQLite migration, migration ledger, and staged restore helper | `server/local-db.ts`, `drizzle-local/0000_open_khan.sql`, `server/local-persistence.test.ts` |
| Hosted object-storage presigning and proxy | Controlled local artifact root and session-protected download route | `server/local-storage.ts`, local storage containment regression |
| Forge scheduler / heartbeat client | In-process due-checkpoint monitor supervisor | `server/services/local-monitor.ts`, restart checkpoint regression |
| Platform runtime plugin and debug collector | Plain local Vite configuration | `vite.config.ts`, `package.json` |

## Residual external connections

Gemini, Google Jules, and GitHub are retained by design. They are provider integrations, not hosting dependencies, and all requests occur only inside server-side provider adapters after the local credential vault decrypts an operator-supplied key for that request.

## Verification status

TypeScript, the complete Vitest suite, and the production build were re-run after the audit and legacy-module removal. The remaining operational validation is an operator-side local browser launch on the target machine, because the one-time bootstrap URL is intentionally process-private and never exposed to a hosted preview.
