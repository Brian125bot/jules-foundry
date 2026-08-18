# Jules Foundry Security and Governance Architecture

## Overview

Jules Foundry is designed for high-consequence enterprise software engineering environments. Because autonomous agents possess the ability to alter code, create pull requests, and execute commands, Jules Foundry incorporates rigorous security boundaries, strict path containment, short-lived concurrency leases, and zero-leak credential handling.

---

## 1. Write-Only Credential Vault (`server/services/vault.ts`)

### Zero-Leak Design
Raw API keys and tokens (Jules API key, Gemini API key, GitHub fine-grained PATs) are treated as **write-only secrets**:
- Secret fields are accepted via `save` mutations and immediately encrypted server-side.
- Raw secret values are **never stored in plaintext**, never written to logs, and **never returned in API responses or tRPC queries**.
- API queries return only a masked preview string (e.g., `...a1b2`), the credential label, provider status, version, and timestamp.

### Encryption Specifications
- **Algorithm**: AES-256-GCM (Galois/Counter Mode) authenticated encryption.
- **Key Derivation**: SHA-256 digest calculated over `process.env.JWT_SECRET`.
- **Initialization Vector (IV)**: 16 bytes of cryptographically secure random bytes generated per encryption call (`crypto.randomBytes(16)`).
- **Authentication Tag**: 16-byte GCM authentication tag appended to the ciphertext payload.

```
Raw Secret + Random IV ──► AES-256-GCM ──► Ciphertext + Auth Tag ──► Encrypted Storage
```

---

## 2. Path Containment & Conflict Prevention

To prevent autonomous agents from making uncoordinated, destructive changes across repository files, Jules Foundry enforces path containment policies:

### Allowed Paths Definition
When Gemini compiles a prompt into a task graph, every task must explicitly define `allowedPaths` (e.g. `["src/components/Header.tsx", "src/hooks/useAuth.ts"]`).

### Scope Review Quarantine (`SCOPE_REVIEW_PATH`)
If Gemini emits a task without concrete file paths, Foundry normalizes the task by inserting `__SCOPE_REVIEW_REQUIRED__` and assigning a `red` risk tier. Any dispatch attempt on a task containing `__SCOPE_REVIEW_REQUIRED__` is automatically rejected with a scope review block message.

### Active Path Reservation Lock
When a task is dispatched, Foundry inspects all active sibling tasks (`reserved`, `dispatched`, `plan_gate`, `executing`) within the same initiative. If an active task shares an `allowedPath` with the dispatch candidate, the dispatch is blocked to prevent concurrent file collision:

```ts
const conflictingTask = activeSiblings.find(sibling =>
  sibling.id !== record.task.id &&
  parseList(sibling.allowedPaths).some(path => allowedPaths.includes(path))
);
if (conflictingTask) {
  throw new Error(`Reservation conflict with active task '${conflictingTask.title}' on shared allowed paths.`);
}
```

---

## 3. Concurrency Control & Operator Action Leases

To eliminate race conditions when multiple operators interact with the same mission command deck:

### Short-Lived Control Leases (`task_control_leases`)
Executing session controls (`refresh`, `approve_plan`, `send_message`, `request_delete`, `set_local_hold`, `release_local_hold`, `reconcile`) acquires a 30-second lease locked by `taskId` and `inputDigest`.

```ts
const lease = await db.select().from(taskControlLeases).where(eq(taskControlLeases.taskId, taskId)).limit(1);
if (lease && lease.expiresAt > new Date() && lease.controlDigest !== inputDigest) {
  throw new TRPCError({
    code: "CONFLICT",
    message: "Another session control is in flight for this task. Refresh the command ledger and retry after it completes."
  });
}
```

---

## 4. Governed Destructive Actions

Destructive operations (such as session deletion or initiative removal) are protected by multi-layered verification:

1. **Active Session Lock**: Initiatives with active Jules sessions (`dispatched`, `plan_gate`, `executing`) cannot be deleted.
2. **Typed Confirmation**: Destructive actions require the user to explicitly type the exact name of the entity (initiative title or Jules session name) into the confirmation control before submission.
3. **Audit Ledger Logging**: Every destructive action generates an event in `task_events` and records the actor ID, timestamp, and precondition snapshot.

---

## 5. Auditability & Provenance

Jules Foundry maintains an append-only event ledger (`task_events`) that tracks every state transition, operator action, provider polling activity, and evidence verification result:

- **Correlation IDs**: Distributed correlation tokens generated via `nanoid()` link client actions to backend background reconciliations.
- **Payload Digests**: SHA-256 digests of payloads enable tamper-evident verification without storing sensitive input text in plain sight.
- **Exportable Evidence Dossiers**: Operators can generate exportable markdown dossiers (`jules-foundry-task-{key}-dossier.md`) capturing full task history, acceptance criterion statuses, PR references, and event provenance.
