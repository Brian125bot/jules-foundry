import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const credentialProfiles = mysqlTable(
  "credential_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    provider: mysqlEnum("provider", ["jules", "gemini", "github"]).notNull(),
    label: varchar("label", { length: 120 }).notNull(),
    encryptedSecret: text("encryptedSecret").notNull(),
    maskedSecret: varchar("maskedSecret", { length: 24 }).notNull(),
    status: mysqlEnum("status", ["unverified", "ready", "error"]).default("unverified").notNull(),
    lastTestedAt: timestamp("lastTestedAt"),
    lastError: varchar("lastError", { length: 300 }),
    version: int("version").default(1).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("credential_user_idx").on(table.userId), uniqueIndex("credential_user_label_unique").on(table.userId, table.provider, table.label)],
);

export const initiatives = mysqlTable(
  "initiatives",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    prompt: text("prompt").notNull(),
    repository: varchar("repository", { length: 255 }).notNull(),
    branch: varchar("branch", { length: 255 }).notNull(),
    baseSha: varchar("baseSha", { length: 80 }),
    budgetCents: int("budgetCents").default(500).notNull(),
    geminiModel: varchar("geminiModel", { length: 80 }).default("gemini-2.5-flash").notNull(),
    status: mysqlEnum("status", ["draft", "compiled", "active", "complete", "attention"]).default("draft").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("initiative_user_idx").on(table.userId)],
);

export const tasks = mysqlTable(
  "tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    initiativeId: int("initiativeId").notNull(),
    taskKey: varchar("taskKey", { length: 48 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").notNull(),
    riskTier: mysqlEnum("riskTier", ["green", "amber", "red"]).notNull(),
    state: mysqlEnum("state", ["draft", "ready", "reserved", "dispatched", "plan_gate", "executing", "verifying", "review_ready", "closed", "blocked"]).default("ready").notNull(),
    health: mysqlEnum("health", ["healthy", "stale", "attention", "terminal"]).default("healthy").notNull(),
    allowedPaths: text("allowedPaths").notNull(),
    nonGoals: text("nonGoals").notNull(),
    acceptanceCriteria: text("acceptanceCriteria").notNull(),
    dependencies: text("dependencies").notNull(),
    blockedReason: varchar("blockedReason", { length: 500 }),
    reservationConflict: varchar("reservationConflict", { length: 300 }),
    dispatchOrder: int("dispatchOrder").default(0).notNull(),
    requirePlanApproval: int("requirePlanApproval").default(1).notNull(),
    autoCreatePr: int("autoCreatePr").default(1).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 96 }).notNull(),
    julesSessionName: varchar("julesSessionName", { length: 128 }),
    julesSessionId: varchar("julesSessionId", { length: 128 }),
    julesSessionUrl: varchar("julesSessionUrl", { length: 500 }),
    julesState: varchar("julesState", { length: 80 }),
    julesPlan: text("julesPlan"),
    prUrl: varchar("prUrl", { length: 500 }),
    lastPolledAt: timestamp("lastPolledAt"),
    lastActivityAt: timestamp("lastActivityAt"),
    lastError: varchar("lastError", { length: 500 }),
    localHold: int("localHold").default(0).notNull(),
    localHoldReason: text("localHoldReason"),
    localHoldAt: timestamp("localHoldAt"),
    localHoldBy: int("localHoldBy"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("task_key_unique").on(table.taskKey),
    uniqueIndex("task_idempotency_unique").on(table.idempotencyKey),
    index("task_initiative_idx").on(table.initiativeId),
    index("task_state_idx").on(table.state, table.health),
  ],
);

export const taskEvents = mysqlTable(
  "task_events",
  {
    id: int("id").autoincrement().primaryKey(),
    eventId: varchar("eventId", { length: 64 }).notNull(),
    taskId: int("taskId").notNull(),
    source: mysqlEnum("source", ["local", "jules", "github", "gemini"]).notNull(),
    eventType: varchar("eventType", { length: 100 }).notNull(),
    previousState: varchar("previousState", { length: 80 }),
    nextState: varchar("nextState", { length: 80 }),
    summary: text("summary").notNull(),
    payloadDigest: varchar("payloadDigest", { length: 128 }),
    providerActivityId: varchar("providerActivityId", { length: 160 }),
    metadata: text("metadata"),
    correlationId: varchar("correlationId", { length: 96 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("task_event_unique").on(table.eventId), uniqueIndex("task_event_activity_unique").on(table.taskId, table.providerActivityId), index("task_event_task_idx").on(table.taskId, table.createdAt)],
);

export const taskAttempts = mysqlTable(
  "task_attempts",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    attemptType: mysqlEnum("attemptType", ["dispatch", "poll", "approval", "message", "verification"]).notNull(),
    idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
    outcome: mysqlEnum("outcome", ["pending", "success", "failure", "reused"]).default("pending").notNull(),
    apiCallCount: int("apiCallCount").default(0).notNull(),
    estimatedSpendCents: int("estimatedSpendCents"),
    backoffReason: varchar("backoffReason", { length: 300 }),
    elapsedMs: int("elapsedMs"),
    details: text("details"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    completedAt: timestamp("completedAt"),
  },
  table => [uniqueIndex("task_attempt_idempotency_unique").on(table.idempotencyKey), index("task_attempt_task_idx").on(table.taskId, table.createdAt)],
);

export const taskEvidence = mysqlTable(
  "task_evidence",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    criterionId: varchar("criterionId", { length: 80 }).notNull(),
    criterionText: text("criterionText").notNull(),
    status: mysqlEnum("status", ["proven", "partial", "unproven", "contradicted"]).default("unproven").notNull(),
    evidenceType: mysqlEnum("evidenceType", ["artifact", "bash_output", "diff", "pr", "activity", "verification"]).notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    reference: varchar("reference", { length: 500 }),
    detail: text("detail"),
    digest: varchar("digest", { length: 128 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("evidence_task_idx").on(table.taskId, table.criterionId)],
);

export const taskApprovals = mysqlTable(
  "task_approvals",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId").notNull(),
    userId: int("userId").notNull(),
    action: mysqlEnum("action", ["approved", "rejected", "corrective_message"]).notNull(),
    message: text("message"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("approval_task_idx").on(table.taskId, table.createdAt)],
);

export const sessionControls = mysqlTable("session_controls", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  julesSessionName: varchar("julesSessionName", { length: 128 }),
  controlType: mysqlEnum("controlType", ["refresh", "approve_plan", "send_message", "request_delete", "set_local_hold", "release_local_hold", "reconcile", "export_dossier"]).notNull(),
  requestedBy: int("requestedBy").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 160 }).notNull(),
  inputDigest: varchar("inputDigest", { length: 128 }).notNull(),
  reason: text("reason"),
  preconditionSnapshot: text("preconditionSnapshot").notNull(),
  status: mysqlEnum("status", ["pending", "succeeded", "failed", "timed_out", "unknown", "superseded"]).default("pending").notNull(),
  providerRequestId: varchar("providerRequestId", { length: 128 }),
  sentAt: timestamp("sentAt"),
  completedAt: timestamp("completedAt"),
  errorCode: varchar("errorCode", { length: 80 }),
  errorMessage: varchar("errorMessage", { length: 500 }),
  responseDigest: varchar("responseDigest", { length: 128 }),
  stateBefore: varchar("stateBefore", { length: 80 }),
  stateAfter: varchar("stateAfter", { length: 80 }),
  eventId: varchar("eventId", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("session_control_idempotency_unique").on(table.idempotencyKey), index("session_control_task_idx").on(table.taskId, table.createdAt)]);

export const taskControlLeases = mysqlTable("task_control_leases", {
  taskId: int("taskId").primaryKey(),
  heldBy: int("heldBy").notNull(),
  controlDigest: varchar("controlDigest", { length: 128 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const sessionMonitorCheckpoints = mysqlTable("session_monitor_checkpoints", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  julesSessionName: varchar("julesSessionName", { length: 128 }).notNull(),
  lastActivityId: varchar("lastActivityId", { length: 160 }),
  latestProviderUpdateTime: timestamp("latestProviderUpdateTime"),
  observedState: varchar("observedState", { length: 80 }),
  lastSuccessfulAt: timestamp("lastSuccessfulAt"),
  lastAttemptAt: timestamp("lastAttemptAt"),
  nextRecommendedPollAt: timestamp("nextRecommendedPollAt"),
  errorStreak: int("errorStreak").default(0).notNull(),
  lastError: varchar("lastError", { length: 500 }),
  lastLatencyMs: int("lastLatencyMs"),
  responseDigest: varchar("responseDigest", { length: 128 }),
  monitorVersion: varchar("monitorVersion", { length: 40 }).default("session-monitor-v1").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("session_monitor_task_unique").on(table.taskId), index("session_monitor_session_idx").on(table.julesSessionName)]);

export const qualityContracts = mysqlTable("quality_contracts", {
  id: int("id").autoincrement().primaryKey(),
  initiativeId: int("initiativeId").notNull(),
  version: int("version").default(1).notNull(),
  outcome: text("outcome").notNull(),
  contractJson: text("contractJson").notNull(),
  criticJson: text("criticJson"),
  ambiguityScore: int("ambiguityScore").default(0).notNull(),
  decision: mysqlEnum("decision", ["draft", "approved", "revise", "human_review"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("quality_contract_initiative_idx").on(table.initiativeId, table.createdAt)]);

export const qualityPrompts = mysqlTable("quality_prompts", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  contractId: int("contractId"),
  templateVersion: varchar("templateVersion", { length: 40 }).notNull(),
  promptDigest: varchar("promptDigest", { length: 128 }).notNull(),
  promptText: text("promptText").notNull(),
  twinJson: text("twinJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("quality_prompt_task_idx").on(table.taskId, table.createdAt), uniqueIndex("quality_prompt_digest_unique").on(table.promptDigest)]);

export const qualityVerifications = mysqlTable("quality_verifications", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  verdict: mysqlEnum("verdict", ["accepted", "conditionally_accepted", "failed_verification", "needs_human_review", "provider_failed"]).notNull(),
  deterministicJson: text("deterministicJson").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  adversarialJson: text("adversarialJson"),
  summary: text("summary").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("quality_verification_task_idx").on(table.taskId, table.createdAt)]);

export const qualityRecoveries = mysqlTable("quality_recoveries", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  domain: mysqlEnum("domain", ["contract", "prompt", "scope", "environment", "implementation", "provider_uncertainty"]).notNull(),
  recommendation: text("recommendation").notNull(),
  autoRetryEligible: int("autoRetryEligible").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("quality_recovery_task_idx").on(table.taskId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CredentialProfile = typeof credentialProfiles.$inferSelect;
export type Initiative = typeof initiatives.$inferSelect;
export type Task = typeof tasks.$inferSelect;
