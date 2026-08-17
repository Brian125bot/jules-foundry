# Granular Session Control and Tracking Plan

**Product:** Jules Foundry  
**Scope:** Per-dispatch controls and observability for individual Jules sessions  
**Planning status:** Proposed implementation plan

## 1. Product objective

Jules Foundry should treat every dispatch as an independently governable **mission** rather than as a passive task record. An operator must be able to see what happened, what is happening now, what action is safe to take next, and who took each action. The resulting control plane should make a single session operationally legible without allowing Foundry to promise provider actions that the Jules API does not document.

> **Core rule:** Foundry may automate observation and record governance decisions, but consequential provider actions must be explicit, attributable, idempotent, and confirmation-gated.

The Jules API documents session creation, inspection, deletion, messaging, and plan approval. It also exposes lifecycle states including `QUEUED`, `PLANNING`, `AWAITING_PLAN_APPROVAL`, `AWAITING_USER_FEEDBACK`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, and `FAILED`. [1] The plan therefore separates **provider-native actions** from Foundry-local safeguards and workflow controls.

| Outcome | Operator capability | Guardrail |
|---|---|---|
| Understand a dispatch | Live state, activity timeline, artifact and patch evidence, freshness, and cost estimate | Every datum has source, timestamp, and poll correlation |
| Guide a dispatch | Send bounded corrective instruction or answer a Jules question | Explicit operator input, immutable command record |
| Release a plan | Compare the Foundry acceptance contract with the Jules plan, then approve | Typed confirmation for elevated-risk tasks |
| Stop work safely | Request destructive session deletion only where supported by Jules | Double confirmation, no local-only “cancelled” fiction |
| Recover from uncertainty | Refresh, reconcile, resync, or mark a control action unknown | Never infer success from a timeout |

## 2. Design principles

The session workspace should be a **mission control surface**, not a collection of buttons. Actions are available only when the state machine permits them. The control plane should show an operator why an action is unavailable, the expected side effect, whether the action changes the remote session, and the evidence required to proceed.

| Principle | Product implication |
|---|---|
| Provider truth wins | Render the raw Jules state alongside Foundry’s derived health and workflow state. |
| Local controls are named honestly | A Foundry “hold” prevents a local follow-on action; it does not claim to pause Jules unless a documented provider action succeeded. |
| Every command is auditable | Persist requestor, request time, idempotency key, request digest, precondition snapshot, outcome, and provider response digest. |
| Safety is progressive | Use lightweight acknowledgement for routine messages, typed confirmation for delete/terminate, and approval re-authentication for red-risk sessions. |
| Monitoring is evidence, not noise | Deduplicate activities by provider activity ID and retain a cursor/checkpoint for recovery. |

## 3. Per-dispatch mission model

### 3.1 Session control record

Introduce a first-class `session_controls` ledger, one row per requested control action, related to a task and optional Jules session. This is distinct from the existing generic attempt ledger because it represents **operator intent** and its exact authorization context.

| Field group | Proposed fields | Purpose |
|---|---|---|
| Identity | `id`, `taskId`, `julesSessionName`, `controlType`, `idempotencyKey` | Makes every command uniquely addressable and retry-safe. |
| Request | `requestedBy`, `requestedAt`, `inputDigest`, `reason`, `preconditionSnapshot` | Attributes intent without storing unnecessary sensitive content. |
| Execution | `status`, `providerRequestId`, `sentAt`, `completedAt`, `errorCode`, `errorMessage` | Distinguishes pending, succeeded, failed, timed out, and unknown execution outcomes. |
| Evidence | `responseDigest`, `stateBefore`, `stateAfter`, `eventId` | Links the control action to the timeline and state transition evidence. |

Supported `controlType` values should initially be `refresh`, `approve_plan`, `send_message`, `request_delete`, `set_local_hold`, `release_local_hold`, `reconcile`, and `export_dossier`. The last three are Foundry-local controls; they must never imply a remote provider state change.

### 3.2 Monitoring checkpoint record

Extend the session tracker with `session_monitor_checkpoints` keyed by task and provider session. It should contain the most recent activity cursor, latest provider session `updateTime`, observed state, poll latency, response hash, monitor version, and next recommended poll time. This enables restart-safe reconciliation and avoids repeatedly ingesting the same activity stream.

The Jules Activities API supports paginated session activities and exposes typed events for plans, plan approval, user and agent messages, progress updates, completion, failures, and artifacts. [2] Foundry should normalize each of those events into the existing append-only mission ledger while retaining a stable activity ID and raw payload digest.

## 4. Control deck UX

### 4.1 Mission header

The top of `/tasks/:id` should become a compact **Session Command Deck**. It should display the task title, repository and branch, Jules state, Foundry health, session age, last provider observation, active local hold state, and an unmistakable indication of who last acted.

| Zone | Contents | Interaction model |
|---|---|---|
| State rail | Jules state, Foundry health, age, staleness timer, polling indicator | Always visible; state labels remain selectable and accessible. |
| Primary action | Contextual next step, such as **Approve plan**, **Respond to Jules**, or **Refresh now** | One primary action only, chosen from state and risk. |
| Command menu | Message, local hold, reconcile, evidence export, delete request | Categorize as safe, governance, or destructive. |
| Audit strip | Last control action, actor, time, and outcome | Opens a filterable command ledger. |

### 4.2 State-aware action matrix

The UI should calculate action availability centrally so button state, dialog content, API preconditions, and audit labels agree.

| Jules state | Default primary action | Allowed secondary actions | Disallowed or gated actions |
|---|---|---|---|
| `QUEUED` / `PLANNING` | Refresh now | Send message, set local hold, reconcile | Approve plan unavailable; remote delete requires typed confirmation. |
| `AWAITING_PLAN_APPROVAL` | Review and approve plan | Send corrective message, set local hold, export dossier | Approval requires acceptance-criterion diff and risk acknowledgement. |
| `AWAITING_USER_FEEDBACK` | Respond to Jules | Set local hold, export dossier, reconcile | New dispatch and closure actions unavailable. |
| `IN_PROGRESS` | Refresh now | Send message, set local hold, export dossier | Deletion is destructive and always confirmation-gated. |
| `PAUSED` | Reconcile session | Send message, release local hold | Do not display a “resume” provider action unless the API documents and confirms it. |
| `COMPLETED` / `FAILED` | Review evidence | Export dossier, archive locally, open PR | Remote control commands are disabled; deletion remains historical/destructive. |

### 4.3 Command dialogs

Every dialog should include a concise **effect statement**, a precondition summary, and an audit reason field. A message dialog should show the last Jules question and state that its text is relayed remotely. A plan approval dialog should place the Foundry acceptance contract beside the Jules plan and call out uncovered criteria. A delete dialog should require the user to type the session display name and explain that local deletion must not be recorded as remote deletion unless the Jules API confirms the `DELETE` operation.

## 5. Tracking and evidence model

### 5.1 Timeline layers

The mission timeline should support five independently filterable layers: **provider state**, **operator controls**, **Jules activities**, **artifact/evidence**, and **monitor health**. Ordering must use server-observed timestamps, with provider timestamps shown separately where skew is material.

| Layer | Examples | Retention and behavior |
|---|---|---|
| Provider state | `PLANNING → AWAITING_PLAN_APPROVAL` | Immutable transition event with before/after state. |
| Operator control | Approval, message, deletion request, local hold | Includes actor, reason, idempotency key, and result. |
| Jules activity | Plan, progress, question, bash output, change set | Deduplicated by activity ID; raw payload represented by digest. |
| Evidence | PR, patch summary, test output, criterion verdict | Linked to acceptance criteria and dossier. |
| Monitor health | Poll late, API timeout, cursor reset, recovered | Separates provider uncertainty from task failure. |

### 5.2 Freshness and escalation

Replace a single stale threshold with an explicit per-dispatch monitoring policy. Initial defaults should be adaptive: frequent checks while planning, approval, or active execution; reduced polling for queued work; and no automated polling after terminal evidence is captured. A freshness panel should display the last successful provider read, last attempted read, next due check, error streak, and backoff reason.

This should be implemented using the project’s existing periodic-update mechanism only after selecting a schedule that fits the deployed environment. A failed observation is not a failed Jules session; it should create `attention` only after a configurable error budget or freshness deadline is exceeded.

### 5.3 Artifacts and evidence

Jules activity artifacts can include change sets, bash output, and media. [2] Foundry should capture an index and digest immediately, then store appropriately bounded excerpts for operator review. The evidence view should link each artifact to one or more acceptance criteria and maintain the existing `proven`, `partial`, `unproven`, and `contradicted` labels.

## 6. Safety, permissions, and consistency

The following policies prevent confusing or unsafe controls.

| Concern | Policy |
|---|---|
| Concurrent operators | Acquire a short-lived control lease per task. A second operator sees the in-flight action and can refresh, but cannot duplicate a destructive request. |
| Duplicate action submissions | Use deterministic idempotency keys per task, action, and payload digest. Persist a command before calling Jules. |
| Active session deletion | Require typed confirmation plus a second server-side state read immediately before deletion. If state changed, abort and refresh. |
| Plan approval | Require a current plan digest; reject approval if a newer plan arrived after the review began. |
| Local hold | Record it as Foundry-only and prevent automated follow-on actions. Never label it as a remote pause. |
| Secrets | Continue write-only vault handling. Command and activity records store redacted text previews or payload hashes rather than credentials. |
| Remote API uncertainty | Mark command `unknown` after timeout, reconcile immediately, and avoid retrying a destructive action until the provider state is known. |

## 7. Implementation roadmap

| Slice | Deliverable | Definition of done |
|---|---|---|
| 1. Session domain | Control ledger, monitor checkpoints, state-machine helper, migration | Every action is durable and idempotent; no UI yet. |
| 2. Read control deck | Session header, state rail, command history, activity filters, freshness panel | One task shows a coherent state explanation from persisted data. |
| 3. Safe controls | Refresh, message, plan approval, local hold/release | API preconditions, typed responses, and audit records are complete. |
| 4. Destructive controls | Provider delete request with typed confirmation and reconciliation | No delete can be duplicated or silently assumed successful. |
| 5. Evidence integration | Artifact index, criterion linkage, dossier delta, PR/patch digests | Evidence export explains both work and controls taken. |
| 6. Monitoring | Restart-safe cursor ingestion, adaptive scheduling, escalation policy | A restart does not lose or duplicate activity records. |
| 7. Hardening | RBAC, action lease, error taxonomy, dashboards, operational runbook | Concurrent and timeout paths have automated coverage. |

## 8. Test and rollout plan

The first release should be controlled by a per-user feature flag and limited to read controls plus message and approval actions. Provider deletion should remain disabled until live test sessions demonstrate reliable reconciliation after timeout. Test coverage must include duplicate clicks, concurrent operators, stale state reads, changed plan digest, activity pagination, monitor restart, provider timeout, session deletion failure, and dossier completeness.

| Validation level | Required scenario |
|---|---|
| Unit | Action matrix, idempotency-key construction, transition rules, freshness derivation, payload redaction. |
| Router/database | Control lease, command persistence, duplicate suppression, plan-digest mismatch, local-hold enforcement. |
| Provider mock | Paginated activities, provider state divergence, delete success/failure/timeout, message and approval outcomes. |
| Live non-production | One session per supported state, including active feedback, plan approval, and terminal evidence capture. |
| UX review | Keyboard navigation, destructive confirmation clarity, mobile session deck, empty/error/loading states. |

## 9. Success measures

Success is not measured by the number of buttons. It is demonstrated when an operator can reconstruct a dispatch from the ledger, understand its current state in under a minute, take one state-valid action without ambiguity, and prove afterward who acted and what the provider reported. Operationally, aim for near-zero duplicate commands, no uncontrolled session deletion, complete activity deduplication, and a reconciliation path for every timeout.

## References

[1] [Jules REST API — Sessions](https://jules.google/docs/api/reference/sessions/)  
[2] [Jules REST API — Activities](https://jules.google/docs/api/reference/activities/)
