# Jules Foundry: Complete Codebase Summary & Inspection Report

## Executive Summary

**Jules Foundry** is an enterprise orchestration platform and control plane built to govern autonomous coding agents (Google Jules, Gemini 2.5, and GitHub). Rather than treating agent dispatches as passive tasks or unmonitored scripts, Jules Foundry enforces a strict lifecycle model:

1. **Structured Compiler Intake**: Translates high-level prompts into directed acyclic graph (DAG) task packets with explicit acceptance criteria, allowed path constraints, risk tiers, and dependencies.
2. **Write-Only Security Boundary**: Stores credentials (Jules, Gemini, GitHub) encrypted via AES-256-GCM using keys derived from server secrets. Secrets are write-only and never exposed to the client or log files.
3. **Bounded Path Containment**: Enforces file path reservation locks across active tasks in an initiative, preventing sibling tasks from editing overlapping files simultaneously.
4. **Interactive Control Deck**: Provides a state-aware operator control plane featuring action leases, local holds, typed destructive confirmations, and idempotent provider controls.
5. **Quality Mesh Architecture**: Binds quality contracts, independent AI critiques, proof-carrying prompts, deterministic diff verification, and adversarial reviews into an auditable evidence chain.

---

## Technical Stack & Dependencies

### Core Technologies
- **Language**: TypeScript 5.9 (Strict mode enabled)
- **Frontend Framework**: React 19.2 + Vite 7.1 + Wouter 3.7
- **Styling & UI**: Tailwind CSS v4 + Radix UI Primitives + Lucide Icons + Framer Motion
- **API & Data Layer**: tRPC v11 + TanStack Query v5 + SuperJSON
- **Database & ORM**: MySQL / PlanetScale + Drizzle ORM v0.44 + Drizzle Kit
- **Backend Runtime**: Node.js + Express v4 + tsx / esbuild
- **Testing & Tooling**: Vitest v2.1 + Testing Library + Prettier

---

## Database Architecture & Schema Map (`drizzle/schema.ts`)

The database consists of 13 core relational tables designed for immutability, auditability, and idempotency:

| Table | Purpose | Primary Keys & Indexes |
|---|---|---|
| `users` | User identity & OAuth profile | `id` (PK), `openId` (Unique) |
| `credential_profiles` | Encrypted write-only secrets | `id` (PK), `userId`, `(userId, provider, label)` Unique |
| `initiatives` | High-level engineering goals & repositories | `id` (PK), `userId` (Index) |
| `tasks` | Compiled DAG task nodes & Jules session links | `id` (PK), `taskKey` (Unique), `idempotencyKey` (Unique) |
| `task_events` | Append-only event ledger with provenance | `id` (PK), `eventId` (Unique), `(taskId, providerActivityId)` Unique |
| `task_attempts` | Execution attempt tracking & estimated spend | `id` (PK), `idempotencyKey` (Unique), `taskId` (Index) |
| `task_evidence` | Criterion-linked evidence & verification records | `id` (PK), `(taskId, criterionId)` Index |
| `task_approvals` | Plan approval actions & reviewer feedback | `id` (PK), `(taskId, createdAt)` Index |
| `session_controls` | Idempotent session command ledger | `id` (PK), `idempotencyKey` (Unique), `taskId` Index |
| `task_control_leases` | Short-lived operator concurrency leases | `taskId` (PK) |
| `session_monitor_checkpoints` | Deduplicated monitor activity cursors | `id` (PK), `taskId` (Unique), `julesSessionName` Index |
| `quality_contracts` | Bounded delivery contracts & critic reviews | `id` (PK), `(initiativeId, createdAt)` Index |
| `quality_prompts` | Versioned proof-carrying prompt templates | `id` (PK), `promptDigest` (Unique), `taskId` Index |
| `quality_verifications` | Three-lens terminal verification verdicts | `id` (PK), `(taskId, createdAt)` Index |
| `quality_recoveries` | Bounded failure classification & recovery briefs | `id` (PK), `(taskId, createdAt)` Index |

---

## Backend Services (`server/services/`)

### 1. `vault.ts` (Credential Security)
- Implements AES-256-GCM encryption for stored API keys and tokens.
- Key derivation uses SHA-256 over `process.env.JWT_SECRET`.
- Provides `encryptSecret()`, `decryptSecret()`, `maskSecret()`, and `digestPayload()`.

### 2. `providers.ts` (External Provider Integrations)
- **Jules API (`https://jules.googleapis.com/v1alpha`)**: Source discovery, session creation, polling, message sending, plan approval, and session deletion.
- **Gemini API (`https://generativelanguage.googleapis.com/v1beta`)**: Uses `gemini-2.5-flash` with JSON schemas for task graph compilation, quality contracts, critic reviews, adversarial verification, and recovery analysis.
- **GitHub REST API**: Branch existence validation and repository header checks.

### 3. `session-control.ts` (Control Matrix & Leases)
- Defines session control types: `refresh`, `approve_plan`, `send_message`, `request_delete`, `set_local_hold`, `release_local_hold`, `reconcile`, `export_dossier`.
- Calculates state availability matrix based on Jules session status and local hold states.
- Derives polling delays using exponential backoff with jitter (`nextPollDelaySeconds`).

### 4. `quality.ts` (Quality Mesh Logic)
- Builds deterministic proof maps matching acceptance criteria (`AC-1`, `AC-2`) against recorded evidence.
- Derives task verdicts: `accepted`, `conditionally_accepted`, `failed_verification`, `needs_human_review`, `provider_failed`.
- Classifies failures into six domain buckets for targeted operator recovery.

---

## tRPC Router Map (`server/routers/foundry.ts`)

The `foundry` tRPC router exposes 21 procedures grouped into 7 domains:

1. **`credentials`**: `list`, `save`, `test`, `delete`
2. **`initiatives`**: `list`, `create`, `deletePreview`, `remove`, `compile`
3. **`observatory`**: `fleet`, `taskDetail`, `reconcile`, `poll`
4. **`dispatch`**: `run`
5. **`session`**: `deck`, `command`
6. **`plans`**: `action`
7. **`quality`**: `generateContract`, `decideContract`, `compilePrompt`, `runVerification`, `runRecovery`, `getTaskQuality`, `getInitiativeQuality`
8. **`evidence`**: `add`, `verify`, `dossier`

---

## Frontend Architecture (`client/src/`)

### Key Workspaces
- **Command Center (`Home.tsx`)**: High-level telemetry, active mission count, vault readiness indicators, recent mission activity radar, and operator onboarding sequences.
- **Fleet Observatory (`Fleet.tsx`)**: Real-time read-through table of all tasks, health filtering (`healthy`, `stale`, `attention`, `terminal`), search, task age, and poll reconciliation controls.
- **Initiatives (`Initiatives.tsx`)**: Initiative creation wizard, DAG compilation visualization, dependency graph rendering, blocked reason badges, and destructive deletion dialogs with typed confirmation.
- **Task Detail (`TaskDetail.tsx`)**: Interactive Mission Command Deck, Jules plan review panel, Quality Mesh workspace, event timeline, evidence ledger, and dossier export.
- **Credential Vault (`Credentials.tsx`)**: Write-only secret management interface with connection testing and rotation controls.

---

## Quality & Test Suite Coverage

The repository includes comprehensive Vitest test coverage across 9 test files:

- `server/foundry.test.ts`: Credential vault encryption, DAG validation, path reservation logic, and dossier generation.
- `server/quality.test.ts`: Quality Mesh contract rules, proof map derivation, and recovery classification.
- `server/session-control.test.ts`: Session availability state matrix and control key generation.
- `server/providers.test.ts`: Jules source matching and error handling.
- `server/source-discovery.test.ts`: Paginated Jules source matching rules.
- `server/initiative.delete.test.ts`: Deletion safety rules and session lock states.
- `server/credential.persistence.test.ts`: Credential rotation and consolidation.
- `server/auth.logout.test.ts`: Session cookie clearing logic.
- `client/src/desktop-control-smoke.test.ts`: Frontend component smoke tests.

All tests pass deterministically: `JWT_SECRET=test-secret-key-123 pnpm test`.
