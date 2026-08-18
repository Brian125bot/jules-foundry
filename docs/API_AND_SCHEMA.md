# Jules Foundry API and Schema Reference

## Database Schema Specification (`drizzle/schema.ts`)

Jules Foundry uses MySQL (compatible with PlanetScale / MariaDB) managed via Drizzle ORM.

---

### Table Definitions

#### 1. `users`
User account profiles and OAuth state.
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  openId VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  loginMethod VARCHAR(64),
  role ENUM('user', 'admin') DEFAULT 'user' NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
```

#### 2. `credential_profiles`
Encrypted provider credentials (Jules, Gemini, GitHub).
```sql
CREATE TABLE credential_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  provider ENUM('jules', 'gemini', 'github') NOT NULL,
  label VARCHAR(120) NOT NULL,
  encryptedSecret TEXT NOT NULL,
  maskedSecret VARCHAR(24) NOT NULL,
  status ENUM('unverified', 'ready', 'error') DEFAULT 'unverified' NOT NULL,
  lastTestedAt TIMESTAMP,
  lastError VARCHAR(300),
  version INT DEFAULT 1 NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  UNIQUE INDEX credential_user_label_unique (userId, provider, label),
  INDEX credential_user_idx (userId)
);
```

#### 3. `initiatives`
High-level goals, prompt requirements, target repositories, and budget tracking.
```sql
CREATE TABLE initiatives (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  title VARCHAR(180) NOT NULL,
  prompt TEXT NOT NULL,
  repository VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL,
  baseSha VARCHAR(80),
  budgetCents INT DEFAULT 500 NOT NULL,
  status ENUM('draft', 'compiled', 'active', 'complete', 'attention') DEFAULT 'draft' NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX initiative_user_idx (userId)
);
```

#### 4. `tasks`
Individual nodes of a compiled initiative DAG.
```sql
CREATE TABLE tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  initiativeId INT NOT NULL,
  taskKey VARCHAR(48) NOT NULL UNIQUE,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  riskTier ENUM('green', 'amber', 'red') NOT NULL,
  state ENUM('draft', 'ready', 'reserved', 'dispatched', 'plan_gate', 'executing', 'verifying', 'review_ready', 'closed', 'blocked') DEFAULT 'ready' NOT NULL,
  health ENUM('healthy', 'stale', 'attention', 'terminal') DEFAULT 'healthy' NOT NULL,
  allowedPaths TEXT NOT NULL,
  nonGoals TEXT NOT NULL,
  acceptanceCriteria TEXT NOT NULL,
  dependencies TEXT NOT NULL,
  blockedReason VARCHAR(500),
  reservationConflict VARCHAR(300),
  dispatchOrder INT DEFAULT 0 NOT NULL,
  requirePlanApproval INT DEFAULT 1 NOT NULL,
  autoCreatePr INT DEFAULT 1 NOT NULL,
  idempotencyKey VARCHAR(96) NOT NULL UNIQUE,
  julesSessionName VARCHAR(128),
  julesSessionId VARCHAR(128),
  julesSessionUrl VARCHAR(500),
  julesState VARCHAR(80),
  julesPlan TEXT,
  prUrl VARCHAR(500),
  lastPolledAt TIMESTAMP,
  lastActivityAt TIMESTAMP,
  lastError VARCHAR(500),
  localHold INT DEFAULT 0 NOT NULL,
  localHoldReason TEXT,
  localHoldAt TIMESTAMP,
  localHoldBy INT,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX task_initiative_idx (initiativeId),
  INDEX task_state_idx (state, health)
);
```

#### 5. `task_events`
Append-only activity ledger for mission tracking.
```sql
CREATE TABLE task_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eventId VARCHAR(64) NOT NULL UNIQUE,
  taskId INT NOT NULL,
  source ENUM('local', 'jules', 'github', 'gemini') NOT NULL,
  eventType VARCHAR(100) NOT NULL,
  previousState VARCHAR(80),
  nextState VARCHAR(80),
  summary TEXT NOT NULL,
  payloadDigest VARCHAR(128),
  providerActivityId VARCHAR(160),
  metadata TEXT,
  correlationId VARCHAR(96),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  UNIQUE INDEX task_event_activity_unique (taskId, providerActivityId),
  INDEX task_event_task_idx (taskId, createdAt)
);
```

#### 6. `session_controls`
Idempotent command history for operator session controls.
```sql
CREATE TABLE session_controls (
  id INT AUTO_INCREMENT PRIMARY KEY,
  taskId INT NOT NULL,
  julesSessionName VARCHAR(128),
  controlType ENUM('refresh', 'approve_plan', 'send_message', 'request_delete', 'set_local_hold', 'release_local_hold', 'reconcile', 'export_dossier') NOT NULL,
  requestedBy INT NOT NULL,
  idempotencyKey VARCHAR(160) NOT NULL UNIQUE,
  inputDigest VARCHAR(128) NOT NULL,
  reason TEXT,
  preconditionSnapshot TEXT NOT NULL,
  status ENUM('pending', 'succeeded', 'failed', 'timed_out', 'unknown', 'superseded') DEFAULT 'pending' NOT NULL,
  providerRequestId VARCHAR(128),
  sentAt TIMESTAMP,
  completedAt TIMESTAMP,
  errorCode VARCHAR(80),
  errorMessage VARCHAR(500),
  responseDigest VARCHAR(128),
  stateBefore VARCHAR(80),
  stateAfter VARCHAR(80),
  eventId VARCHAR(64),
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
  INDEX session_control_task_idx (taskId, createdAt)
);
```

#### 7. `task_control_leases`
Concurrency control locks for session actions.
```sql
CREATE TABLE task_control_leases (
  taskId INT PRIMARY KEY,
  heldBy INT NOT NULL,
  controlDigest VARCHAR(128) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL
);
```

---

## tRPC API Procedures (`server/routers/foundry.ts`)

All procedures are prefixed under the `foundry` router namespace.

### Credentials (`foundry.credentials.*`)
- **`list`** (Query): Returns masked credential profiles for the authenticated user.
- **`save`** (Mutation): Saves or rotates a credential profile. Raw secret is encrypted in AES-256-GCM before storage.
- **`test`** (Mutation): Tests live provider connectivity (Jules sources, Gemini models, or GitHub user).
- **`delete`** (Mutation): Deletes a credential profile.

### Initiatives (`foundry.initiatives.*`)
- **`list`** (Query): Retrieves initiatives with embedded tasks, acceptance criteria, and evidence debt counts.
- **`create`** (Mutation): Creates a new initiative.
- **`deletePreview`** (Query): Previews task deletion count and checks if active Jules sessions block deletion.
- **`remove`** (Mutation): Safely deletes an initiative if no active Jules sessions are executing. Requires typed confirmation.
- **`compile`** (Mutation): Calls Gemini 2.5 Flash to compile prompt into an ordered DAG of tasks.

### Observatory (`foundry.observatory.*`)
- **`fleet`** (Query): Lists all tasks across initiatives with real-time derived health status.
- **`taskDetail`** (Query): Retrieves detailed task info including repository, branch, allowed paths, criteria, timeline events, attempts, evidence, and approvals.
- **`reconcile`** (Mutation): Polls all active tasks and updates session checkpoints.
- **`poll`** (Mutation): Polls a specific task's Jules session.

### Dispatch (`foundry.dispatch.*`)
- **`run`** (Mutation): Performs path reservation checks, source validation, branch validation, constructs proof-carrying prompt, and creates a Jules session.

### Session & Control Deck (`foundry.session.*`)
- **`deck`** (Query): Returns control action availability, local hold status, control history, and checkpoint metrics.
- **`command`** (Mutation): Idempotently executes operator commands (`refresh`, `approve_plan`, `send_message`, `set_local_hold`, `release_local_hold`, `reconcile`, `request_delete`).

### Plans (`foundry.plans.*`)
- **`action`** (Mutation): Records plan review actions (`approved`, `rejected`, `corrective_message`) and relays messages to Jules.

### Quality Mesh (`foundry.quality.*`)
- **`generateContract`** (Mutation): Generates quality contract and independent critic evaluation.
- **`decideContract`** (Mutation): Records operator decision (`approved`, `revise`, `human_review`).
- **`compilePrompt`** (Mutation): Assembles proof-carrying prompt template.
- **`runVerification`** (Mutation): Runs three-lens quality verification.
- **`runRecovery`** (Mutation): Classifies failure and generates recovery brief.
- **`getTaskQuality`** (Query): Fetches task quality artifacts.
- **`getInitiativeQuality`** (Query): Fetches initiative-wide quality gate summary.

### Evidence (`foundry.evidence.*`)
- **`add`** (Mutation): Adds criterion-linked evidence.
- **`verify`** (Mutation): Evaluates evidence completeness across acceptance criteria.
- **`dossier`** (Query): Exports markdown evidence dossier for auditing.
