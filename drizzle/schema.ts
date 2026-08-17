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
    metadata: text("metadata"),
    correlationId: varchar("correlationId", { length: 96 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("task_event_unique").on(table.eventId), index("task_event_task_idx").on(table.taskId, table.createdAt)],
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

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type CredentialProfile = typeof credentialProfiles.$inferSelect;
export type Initiative = typeof initiatives.$inferSelect;
export type Task = typeof tasks.$inferSelect;
