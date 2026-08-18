import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = (name = "createdAt") => integer(name, { mode: "timestamp" }).notNull().$defaultFn(() => new Date());
const updatedAt = (name = "updatedAt") => integer(name, { mode: "timestamp" }).notNull().$defaultFn(() => new Date()).$onUpdateFn(() => new Date());

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  lastSignedIn: createdAt("lastSignedIn"),
});

export const credentialProfiles = sqliteTable("credential_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  provider: text("provider", { enum: ["jules", "gemini", "github"] }).notNull(),
  label: text("label").notNull(),
  encryptedSecret: text("encryptedSecret").notNull(),
  maskedSecret: text("maskedSecret").notNull(),
  status: text("status", { enum: ["unverified", "ready", "error"] }).notNull().default("unverified"),
  lastTestedAt: integer("lastTestedAt", { mode: "timestamp" }),
  lastError: text("lastError"),
  version: integer("version").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [index("credential_user_idx").on(table.userId), uniqueIndex("credential_user_label_unique").on(table.userId, table.provider, table.label)]);

export const initiatives = sqliteTable("initiatives", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("userId").notNull(),
  title: text("title").notNull(),
  prompt: text("prompt").notNull(),
  repository: text("repository").notNull(),
  branch: text("branch").notNull(),
  baseSha: text("baseSha"),
  budgetCents: integer("budgetCents").notNull().default(500),
  geminiModel: text("geminiModel").notNull().default("gemini-2.5-flash"),
  status: text("status", { enum: ["draft", "compiled", "active", "complete", "attention"] }).notNull().default("draft"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [index("initiative_user_idx").on(table.userId)]);

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  initiativeId: integer("initiativeId").notNull(),
  taskKey: text("taskKey").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  riskTier: text("riskTier", { enum: ["green", "amber", "red"] }).notNull(),
  state: text("state", { enum: ["draft", "ready", "reserved", "dispatched", "plan_gate", "executing", "verifying", "review_ready", "closed", "blocked"] }).notNull().default("ready"),
  health: text("health", { enum: ["healthy", "stale", "attention", "terminal"] }).notNull().default("healthy"),
  allowedPaths: text("allowedPaths").notNull(),
  nonGoals: text("nonGoals").notNull(),
  acceptanceCriteria: text("acceptanceCriteria").notNull(),
  dependencies: text("dependencies").notNull(),
  blockedReason: text("blockedReason"),
  reservationConflict: text("reservationConflict"),
  dispatchOrder: integer("dispatchOrder").notNull().default(0),
  requirePlanApproval: integer("requirePlanApproval").notNull().default(1),
  autoCreatePr: integer("autoCreatePr").notNull().default(1),
  idempotencyKey: text("idempotencyKey").notNull(),
  julesSessionName: text("julesSessionName"),
  julesSessionId: text("julesSessionId"),
  julesSessionUrl: text("julesSessionUrl"),
  julesState: text("julesState"),
  julesPlan: text("julesPlan"),
  prUrl: text("prUrl"),
  lastPolledAt: integer("lastPolledAt", { mode: "timestamp" }),
  lastActivityAt: integer("lastActivityAt", { mode: "timestamp" }),
  lastError: text("lastError"),
  localHold: integer("localHold").notNull().default(0),
  localHoldReason: text("localHoldReason"),
  localHoldAt: integer("localHoldAt", { mode: "timestamp" }),
  localHoldBy: integer("localHoldBy"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [uniqueIndex("task_key_unique").on(table.taskKey), uniqueIndex("task_idempotency_unique").on(table.idempotencyKey), index("task_initiative_idx").on(table.initiativeId), index("task_state_idx").on(table.state, table.health)]);

export const taskEvents = sqliteTable("task_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("eventId").notNull(),
  taskId: integer("taskId").notNull(),
  source: text("source", { enum: ["local", "jules", "github", "gemini"] }).notNull(),
  eventType: text("eventType").notNull(),
  previousState: text("previousState"),
  nextState: text("nextState"),
  summary: text("summary").notNull(),
  payloadDigest: text("payloadDigest"),
  providerActivityId: text("providerActivityId"),
  metadata: text("metadata"),
  correlationId: text("correlationId"),
  createdAt: createdAt(),
}, table => [uniqueIndex("task_event_unique").on(table.eventId), uniqueIndex("task_event_activity_unique").on(table.taskId, table.providerActivityId), index("task_event_task_idx").on(table.taskId, table.createdAt)]);

export const taskAttempts = sqliteTable("task_attempts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  attemptType: text("attemptType", { enum: ["dispatch", "poll", "approval", "message", "verification"] }).notNull(),
  idempotencyKey: text("idempotencyKey").notNull(),
  outcome: text("outcome", { enum: ["pending", "success", "failure", "reused"] }).notNull().default("pending"),
  apiCallCount: integer("apiCallCount").notNull().default(0),
  estimatedSpendCents: integer("estimatedSpendCents"),
  backoffReason: text("backoffReason"),
  elapsedMs: integer("elapsedMs"),
  details: text("details"),
  createdAt: createdAt(),
  completedAt: integer("completedAt", { mode: "timestamp" }),
}, table => [uniqueIndex("task_attempt_idempotency_unique").on(table.idempotencyKey), index("task_attempt_task_idx").on(table.taskId, table.createdAt)]);

export const taskEvidence = sqliteTable("task_evidence", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  criterionId: text("criterionId").notNull(),
  criterionText: text("criterionText").notNull(),
  status: text("status", { enum: ["proven", "partial", "unproven", "contradicted"] }).notNull().default("unproven"),
  evidenceType: text("evidenceType", { enum: ["artifact", "bash_output", "diff", "pr", "activity", "verification"] }).notNull(),
  label: text("label").notNull(),
  reference: text("reference"),
  detail: text("detail"),
  digest: text("digest"),
  createdAt: createdAt(),
}, table => [index("evidence_task_idx").on(table.taskId, table.criterionId)]);

export const taskApprovals = sqliteTable("task_approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  userId: integer("userId").notNull(),
  action: text("action", { enum: ["approved", "rejected", "corrective_message"] }).notNull(),
  message: text("message"),
  createdAt: createdAt(),
}, table => [index("approval_task_idx").on(table.taskId, table.createdAt)]);

export const sessionControls = sqliteTable("session_controls", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  julesSessionName: text("julesSessionName"),
  controlType: text("controlType", { enum: ["refresh", "approve_plan", "send_message", "request_delete", "set_local_hold", "release_local_hold", "reconcile", "export_dossier"] }).notNull(),
  requestedBy: integer("requestedBy").notNull(),
  idempotencyKey: text("idempotencyKey").notNull(),
  inputDigest: text("inputDigest").notNull(),
  reason: text("reason"),
  preconditionSnapshot: text("preconditionSnapshot").notNull(),
  status: text("status", { enum: ["pending", "succeeded", "failed", "timed_out", "unknown", "superseded"] }).notNull().default("pending"),
  providerRequestId: text("providerRequestId"),
  sentAt: integer("sentAt", { mode: "timestamp" }),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  errorCode: text("errorCode"),
  errorMessage: text("errorMessage"),
  responseDigest: text("responseDigest"),
  stateBefore: text("stateBefore"),
  stateAfter: text("stateAfter"),
  eventId: text("eventId"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [uniqueIndex("session_control_idempotency_unique").on(table.idempotencyKey), index("session_control_task_idx").on(table.taskId, table.createdAt)]);

export const taskControlLeases = sqliteTable("task_control_leases", {
  taskId: integer("taskId").primaryKey(),
  heldBy: integer("heldBy").notNull(),
  controlDigest: text("controlDigest").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessionMonitorCheckpoints = sqliteTable("session_monitor_checkpoints", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  julesSessionName: text("julesSessionName").notNull(),
  lastActivityId: text("lastActivityId"),
  latestProviderUpdateTime: integer("latestProviderUpdateTime", { mode: "timestamp" }),
  observedState: text("observedState"),
  lastSuccessfulAt: integer("lastSuccessfulAt", { mode: "timestamp" }),
  lastAttemptAt: integer("lastAttemptAt", { mode: "timestamp" }),
  nextRecommendedPollAt: integer("nextRecommendedPollAt", { mode: "timestamp" }),
  errorStreak: integer("errorStreak").notNull().default(0),
  lastError: text("lastError"),
  lastLatencyMs: integer("lastLatencyMs"),
  responseDigest: text("responseDigest"),
  monitorVersion: text("monitorVersion").notNull().default("session-monitor-v1"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [uniqueIndex("session_monitor_task_unique").on(table.taskId), index("session_monitor_session_idx").on(table.julesSessionName)]);

export const qualityContracts = sqliteTable("quality_contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  initiativeId: integer("initiativeId").notNull(),
  version: integer("version").notNull().default(1),
  outcome: text("outcome").notNull(),
  contractJson: text("contractJson").notNull(),
  criticJson: text("criticJson"),
  ambiguityScore: integer("ambiguityScore").notNull().default(0),
  decision: text("decision", { enum: ["draft", "approved", "revise", "human_review"] }).notNull().default("draft"),
  createdAt: createdAt(),
}, table => [index("quality_contract_initiative_idx").on(table.initiativeId, table.createdAt)]);

export const qualityPrompts = sqliteTable("quality_prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  contractId: integer("contractId"),
  templateVersion: text("templateVersion").notNull(),
  promptDigest: text("promptDigest").notNull(),
  promptText: text("promptText").notNull(),
  twinJson: text("twinJson").notNull(),
  createdAt: createdAt(),
}, table => [index("quality_prompt_task_idx").on(table.taskId, table.createdAt), uniqueIndex("quality_prompt_digest_unique").on(table.promptDigest)]);

export const qualityVerifications = sqliteTable("quality_verifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  verdict: text("verdict", { enum: ["accepted", "conditionally_accepted", "failed_verification", "needs_human_review", "provider_failed"] }).notNull(),
  deterministicJson: text("deterministicJson").notNull(),
  evidenceJson: text("evidenceJson").notNull(),
  adversarialJson: text("adversarialJson"),
  summary: text("summary").notNull(),
  createdAt: createdAt(),
}, table => [index("quality_verification_task_idx").on(table.taskId, table.createdAt)]);

export const qualityRecoveries = sqliteTable("quality_recoveries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("taskId").notNull(),
  domain: text("domain", { enum: ["contract", "prompt", "scope", "environment", "implementation", "provider_uncertainty"] }).notNull(),
  recommendation: text("recommendation").notNull(),
  autoRetryEligible: integer("autoRetryEligible").notNull().default(0),
  createdAt: createdAt(),
}, table => [index("quality_recovery_task_idx").on(table.taskId, table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CredentialProfile = typeof credentialProfiles.$inferSelect;
export type Initiative = typeof initiatives.$inferSelect;
export type Task = typeof tasks.$inferSelect;
