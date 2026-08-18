# Jules Foundry System Architecture

## Overview

Jules Foundry is an enterprise orchestration platform designed to bridge high-level engineering directives with autonomous coding execution by Google Jules, Gemini, and GitHub. The system is engineered around four core architecture pillars:

1. **Deterministic Task DAG Compilation**: Structured AI output transformed into a validated, dependency-ordered task graph.
2. **Safe Session Governance & State Control**: Idempotent session command deck with short-lived leases and typed destructive confirmations.
3. **Write-Only Zero-Leak Security Boundary**: AES-256-GCM encrypted credential vault with zero secret leakage to logs or clients.
4. **Quality Mesh Verification Pipeline**: Three-lens verification (Deterministic, Evidence, Adversarial) that decouples agent completion from quality acceptance.

---

## High-Level System Architecture

```
                                  ┌───────────────────────────┐
                                  │   OPERATOR / CONTROL UI   │
                                  │ (React 19 / Wouter / CSS) │
                                  └─────────────┬─────────────┘
                                                │ tRPC Protocol
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       EXPRESS SERVER                                          │
│                                                                                               │
│  ┌────────────────────────┐      ┌────────────────────────┐      ┌─────────────────────────┐  │
│  │    Credential Vault    │      │    Foundry Core Router │      │      Quality Mesh       │  │
│  │ (AES-256-GCM / SHA256) │      │ (Task Graph / Dispatch)│      │  (Contracts / Verifier) │  │
│  └───────────┬────────────┘      └───────────┬────────────┘      └────────────┬────────────┘  │
└──────────────┼───────────────────────────────┼────────────────────────────────┼───────────────┘
               │                               │                                │
               ▼                               ▼                                ▼
     ┌──────────────────┐            ┌──────────────────┐             ┌──────────────────┐
     │  GitHub REST API │            │  Jules REST API  │             │ Gemini 2.5 Flash │
     │ (Branch & Repos) │            │ (Sessions/Events)│             │(Compiler/Critique│
     └──────────────────┘            └──────────────────┘             └──────────────────┘
```

---

## Core System Subsystems

### 1. Intent Intake & Gemini DAG Compiler
When an operator creates an initiative, the natural language prompt is sent to `gemini-2.5-flash` with a strict JSON schema requirement (`geminiResponseSchema`).

- **Validation Routine (`validateCompiledDag`)**:
  - **Duplicate Title Detection**: Ensures task titles are unique across the initiative.
  - **Self-Dependency Check**: Rejects any task that lists itself as a dependency.
  - **Cycle Detection**: Applies Depth-First Search (DFS) with node coloring (`visiting` vs `visited`) to detect and reject graph cycles.
  - **Scope Quarantine**: Tasks returned by Gemini without concrete `allowedPaths` are normalized to include `__SCOPE_REVIEW_REQUIRED__` and quarantined into a `red` risk tier, blocking dispatch until reviewed.

```
Raw Prompt ──► Gemini 2.5 Flash ──► Normalization ──► DFS Cycle & Self-Dep Check ──► Database Insertion
```

---

### 2. Bounded Jules Dispatch & Path Reservation Locking
Before a task is dispatched to Jules, Foundry enforces path containment:

1. **Scope Review Check**: If `allowedPaths` contains `__SCOPE_REVIEW_REQUIRED__`, dispatch is rejected and the task state is set to `blocked`.
2. **Path Reservation Conflict Analysis**: Foundry queries active sibling tasks (`reserved`, `dispatched`, `plan_gate`, `executing`) in the same initiative. If an overlapping `allowedPath` is found, the dispatch is blocked with a reservation conflict message.
3. **Pre-flight External Checks**:
   - Validates that the GitHub fine-grained token can access the repository branch (`validateGitHubBranch`).
   - Validates that the Jules API key has a connected source matching the repository (`findJulesSource`).
4. **Idempotent Session Creation**: Creates a Jules session using `autoCreatePr` and `requirePlanApproval` options. If dispatch fails *before* session creation, the path reservation lock is automatically released to prevent false blocking.

---

### 3. Session Command Deck & State Machine

The session command deck calculates action availability dynamically based on the current Jules state and local hold flags (`controlAvailability`):

```
                   ┌──────────┐
                   │  DRAFT   │
                   └────┬─────┘
                        │ Compile
                        ▼
                   ┌──────────┐
                   │  READY   │
                   └────┬─────┘
                        │ Dispatch & Lock Paths
                        ▼
                   ┌──────────┐
                ┌──┤ RESERVED ├──┐
                │  └──────────┘  │
                ▼                ▼
       ┌────────────────┐ ┌───────────────┐
       │ PLAN_GATE      │ │ EXECUTING     │
       │ (Plan Approval)│ │ (In Progress) │
       └───────┬────────┘ └───────┬───────┘
               │                  │
               ▼                  ▼
       ┌──────────────────────────────────┐
       │           REVIEW_READY           │
       │ (Terminal State -> Quality Mesh) │
       └──────────────────────────────────┘
```

#### Action Availability Matrix
| Jules State | Primary Action | Allowed Actions | Restricted Actions |
|---|---|---|---|
| `QUEUED` / `PLANNING` | Refresh | Send Message, Local Hold, Reconcile | Approve Plan |
| `AWAITING_PLAN_APPROVAL` | Approve Plan | Send Corrective Message, Local Hold | Direct Execution |
| `AWAITING_USER_FEEDBACK` | Send Message | Local Hold, Reconcile | Automatic Approval |
| `IN_PROGRESS` | Refresh | Send Message, Local Hold | Direct State Overrides |
| `COMPLETED` / `FAILED` | Quality Review | Export Dossier | Remote Provider Commands |

#### Short-Lived Action Leases (`task_control_leases`)
To prevent concurrent operator race conditions, session controls acquire a 30-second lease keyed by `taskId` and `inputDigest`. Concurrent commands targeting the same task are rejected with `409 CONFLICT`.

---

## The Quality Mesh Architecture

The Quality Mesh operates as an orchestration wrapper around task execution. It enforces quality through three distinct evaluation lenses:

```
                            ┌────────────────────────┐
                            │    Terminal Session    │
                            └───────────┬────────────┘
                                        │
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    THREE-LENS VERIFIER                                       │
│                                                                                              │
│   ┌────────────────────────┐   ┌────────────────────────┐   ┌────────────────────────────┐   │
│   │   1. Deterministic     │   │      2. Evidence       │   │      3. Adversarial        │   │
│   │ (Diffs, Paths, Tests)  │──►│ (Activity Artifacts)   │──►│  (Gemini Contradictions)   │   │
│   └────────────────────────┘   └────────────────────────┘   └────────────────────────────┘   │
└───────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                        │
                                        ▼
                            ┌────────────────────────┐
                            │    Task Verdict        │
                            │ (Accepted / Rejected)  │
                            └────────────────────────┘
```

1. **Deterministic Lens**: Evaluates hard facts—git diffs against `allowedPaths`, test suite executions, build outputs, and GitHub PR statuses.
2. **Evidence Lens**: Maps activity artifacts and output snippets to specific criteria (`AC-1`, `AC-2`) with statuses: `proven`, `partial`, `unproven`, `contradicted`.
3. **Adversarial Lens**: Uses Gemini in a bounded reviewer role to find missing requirements, scope creep, or false claims of success.

---

## Data Pipeline & Monitoring Reconciler

1. **Deduplicated Ingestion**: Polling operations fetch session activities from `/sessions/{name}/activities`. Each activity is stored in `task_events` with a unique constraint on `(taskId, providerActivityId)`.
2. **Monitor Checkpoints**: `session_monitor_checkpoints` stores the last activity cursor, update time, latency, and recommended poll delay.
3. **Adaptive Exponential Backoff**: Active sessions (`IN_PROGRESS`, `PLANNING`) poll every 30 seconds; inactive work polls every 120 seconds. Error streaks scale delay exponentially up to 900 seconds.
