CREATE TABLE `credential_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`provider` text NOT NULL,
	`label` text NOT NULL,
	`encryptedSecret` text NOT NULL,
	`maskedSecret` text NOT NULL,
	`status` text DEFAULT 'unverified' NOT NULL,
	`lastTestedAt` integer,
	`lastError` text,
	`version` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `credential_user_idx` ON `credential_profiles` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `credential_user_label_unique` ON `credential_profiles` (`userId`,`provider`,`label`);--> statement-breakpoint
CREATE TABLE `initiatives` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`userId` integer NOT NULL,
	`title` text NOT NULL,
	`prompt` text NOT NULL,
	`repository` text NOT NULL,
	`branch` text NOT NULL,
	`baseSha` text,
	`budgetCents` integer DEFAULT 500 NOT NULL,
	`geminiModel` text DEFAULT 'gemini-2.5-flash' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `initiative_user_idx` ON `initiatives` (`userId`);--> statement-breakpoint
CREATE TABLE `quality_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`initiativeId` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`outcome` text NOT NULL,
	`contractJson` text NOT NULL,
	`criticJson` text,
	`ambiguityScore` integer DEFAULT 0 NOT NULL,
	`decision` text DEFAULT 'draft' NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quality_contract_initiative_idx` ON `quality_contracts` (`initiativeId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `quality_prompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`contractId` integer,
	`templateVersion` text NOT NULL,
	`promptDigest` text NOT NULL,
	`promptText` text NOT NULL,
	`twinJson` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quality_prompt_task_idx` ON `quality_prompts` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `quality_prompt_digest_unique` ON `quality_prompts` (`promptDigest`);--> statement-breakpoint
CREATE TABLE `quality_recoveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`domain` text NOT NULL,
	`recommendation` text NOT NULL,
	`autoRetryEligible` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quality_recovery_task_idx` ON `quality_recoveries` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `quality_verifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`verdict` text NOT NULL,
	`deterministicJson` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`adversarialJson` text,
	`summary` text NOT NULL,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `quality_verification_task_idx` ON `quality_verifications` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `session_controls` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`julesSessionName` text,
	`controlType` text NOT NULL,
	`requestedBy` integer NOT NULL,
	`idempotencyKey` text NOT NULL,
	`inputDigest` text NOT NULL,
	`reason` text,
	`preconditionSnapshot` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`providerRequestId` text,
	`sentAt` integer,
	`completedAt` integer,
	`errorCode` text,
	`errorMessage` text,
	`responseDigest` text,
	`stateBefore` text,
	`stateAfter` text,
	`eventId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_control_idempotency_unique` ON `session_controls` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `session_control_task_idx` ON `session_controls` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `session_monitor_checkpoints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`julesSessionName` text NOT NULL,
	`lastActivityId` text,
	`latestProviderUpdateTime` integer,
	`observedState` text,
	`lastSuccessfulAt` integer,
	`lastAttemptAt` integer,
	`nextRecommendedPollAt` integer,
	`errorStreak` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`lastLatencyMs` integer,
	`responseDigest` text,
	`monitorVersion` text DEFAULT 'session-monitor-v1' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_monitor_task_unique` ON `session_monitor_checkpoints` (`taskId`);--> statement-breakpoint
CREATE INDEX `session_monitor_session_idx` ON `session_monitor_checkpoints` (`julesSessionName`);--> statement-breakpoint
CREATE TABLE `task_approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`userId` integer NOT NULL,
	`action` text NOT NULL,
	`message` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `approval_task_idx` ON `task_approvals` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `task_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`attemptType` text NOT NULL,
	`idempotencyKey` text NOT NULL,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`apiCallCount` integer DEFAULT 0 NOT NULL,
	`estimatedSpendCents` integer,
	`backoffReason` text,
	`elapsedMs` integer,
	`details` text,
	`createdAt` integer NOT NULL,
	`completedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_attempt_idempotency_unique` ON `task_attempts` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `task_attempt_task_idx` ON `task_attempts` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `task_control_leases` (
	`taskId` integer PRIMARY KEY NOT NULL,
	`heldBy` integer NOT NULL,
	`controlDigest` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eventId` text NOT NULL,
	`taskId` integer NOT NULL,
	`source` text NOT NULL,
	`eventType` text NOT NULL,
	`previousState` text,
	`nextState` text,
	`summary` text NOT NULL,
	`payloadDigest` text,
	`providerActivityId` text,
	`metadata` text,
	`correlationId` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_event_unique` ON `task_events` (`eventId`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_event_activity_unique` ON `task_events` (`taskId`,`providerActivityId`);--> statement-breakpoint
CREATE INDEX `task_event_task_idx` ON `task_events` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE TABLE `task_evidence` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taskId` integer NOT NULL,
	`criterionId` text NOT NULL,
	`criterionText` text NOT NULL,
	`status` text DEFAULT 'unproven' NOT NULL,
	`evidenceType` text NOT NULL,
	`label` text NOT NULL,
	`reference` text,
	`detail` text,
	`digest` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `evidence_task_idx` ON `task_evidence` (`taskId`,`criterionId`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`initiativeId` integer NOT NULL,
	`taskKey` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`riskTier` text NOT NULL,
	`state` text DEFAULT 'ready' NOT NULL,
	`health` text DEFAULT 'healthy' NOT NULL,
	`allowedPaths` text NOT NULL,
	`nonGoals` text NOT NULL,
	`acceptanceCriteria` text NOT NULL,
	`dependencies` text NOT NULL,
	`blockedReason` text,
	`reservationConflict` text,
	`dispatchOrder` integer DEFAULT 0 NOT NULL,
	`requirePlanApproval` integer DEFAULT 1 NOT NULL,
	`autoCreatePr` integer DEFAULT 1 NOT NULL,
	`idempotencyKey` text NOT NULL,
	`julesSessionName` text,
	`julesSessionId` text,
	`julesSessionUrl` text,
	`julesState` text,
	`julesPlan` text,
	`prUrl` text,
	`lastPolledAt` integer,
	`lastActivityAt` integer,
	`lastError` text,
	`localHold` integer DEFAULT 0 NOT NULL,
	`localHoldReason` text,
	`localHoldAt` integer,
	`localHoldBy` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `task_key_unique` ON `tasks` (`taskKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `task_idempotency_unique` ON `tasks` (`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `task_initiative_idx` ON `tasks` (`initiativeId`);--> statement-breakpoint
CREATE INDEX `task_state_idx` ON `tasks` (`state`,`health`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`openId` text NOT NULL,
	`name` text,
	`email` text,
	`loginMethod` text,
	`role` text DEFAULT 'user' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`lastSignedIn` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_openId_unique` ON `users` (`openId`);