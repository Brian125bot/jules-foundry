CREATE TABLE `credential_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`provider` enum('jules','gemini','github') NOT NULL,
	`label` varchar(120) NOT NULL,
	`encryptedSecret` text NOT NULL,
	`maskedSecret` varchar(24) NOT NULL,
	`status` enum('unverified','ready','error') NOT NULL DEFAULT 'unverified',
	`lastTestedAt` timestamp,
	`lastError` varchar(300),
	`version` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credential_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `credential_user_label_unique` UNIQUE(`userId`,`provider`,`label`)
);
--> statement-breakpoint
CREATE TABLE `initiatives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`prompt` text NOT NULL,
	`repository` varchar(255) NOT NULL,
	`branch` varchar(255) NOT NULL,
	`baseSha` varchar(80),
	`budgetCents` int NOT NULL DEFAULT 500,
	`status` enum('draft','compiled','active','complete','attention') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `initiatives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`userId` int NOT NULL,
	`action` enum('approved','rejected','corrective_message') NOT NULL,
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`attemptType` enum('dispatch','poll','approval','message','verification') NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`outcome` enum('pending','success','failure','reused') NOT NULL DEFAULT 'pending',
	`apiCallCount` int NOT NULL DEFAULT 0,
	`backoffReason` varchar(300),
	`elapsedMs` int,
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	CONSTRAINT `task_attempts_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_attempt_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(64) NOT NULL,
	`taskId` int NOT NULL,
	`source` enum('local','jules','github','gemini') NOT NULL,
	`eventType` varchar(100) NOT NULL,
	`previousState` varchar(80),
	`nextState` varchar(80),
	`summary` text NOT NULL,
	`payloadDigest` varchar(128),
	`metadata` text,
	`correlationId` varchar(96),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_event_unique` UNIQUE(`eventId`)
);
--> statement-breakpoint
CREATE TABLE `task_evidence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`criterionId` varchar(80) NOT NULL,
	`criterionText` text NOT NULL,
	`status` enum('proven','partial','unproven','contradicted') NOT NULL DEFAULT 'unproven',
	`evidenceType` enum('artifact','bash_output','diff','pr','activity','verification') NOT NULL,
	`label` varchar(255) NOT NULL,
	`reference` varchar(500),
	`detail` text,
	`digest` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`initiativeId` int NOT NULL,
	`taskKey` varchar(48) NOT NULL,
	`title` varchar(200) NOT NULL,
	`description` text NOT NULL,
	`riskTier` enum('green','amber','red') NOT NULL,
	`state` enum('draft','ready','reserved','dispatched','plan_gate','executing','verifying','review_ready','closed','blocked') NOT NULL DEFAULT 'ready',
	`health` enum('healthy','stale','attention','terminal') NOT NULL DEFAULT 'healthy',
	`allowedPaths` text NOT NULL,
	`nonGoals` text NOT NULL,
	`acceptanceCriteria` text NOT NULL,
	`dependencies` text NOT NULL,
	`blockedReason` varchar(500),
	`reservationConflict` varchar(300),
	`dispatchOrder` int NOT NULL DEFAULT 0,
	`requirePlanApproval` int NOT NULL DEFAULT 1,
	`autoCreatePr` int NOT NULL DEFAULT 1,
	`idempotencyKey` varchar(96) NOT NULL,
	`julesSessionName` varchar(128),
	`julesSessionId` varchar(128),
	`julesSessionUrl` varchar(500),
	`julesState` varchar(80),
	`julesPlan` text,
	`prUrl` varchar(500),
	`lastPolledAt` timestamp,
	`lastActivityAt` timestamp,
	`lastError` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_key_unique` UNIQUE(`taskKey`),
	CONSTRAINT `task_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE INDEX `credential_user_idx` ON `credential_profiles` (`userId`);--> statement-breakpoint
CREATE INDEX `initiative_user_idx` ON `initiatives` (`userId`);--> statement-breakpoint
CREATE INDEX `approval_task_idx` ON `task_approvals` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `task_attempt_task_idx` ON `task_attempts` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `task_event_task_idx` ON `task_events` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `evidence_task_idx` ON `task_evidence` (`taskId`,`criterionId`);--> statement-breakpoint
CREATE INDEX `task_initiative_idx` ON `tasks` (`initiativeId`);--> statement-breakpoint
CREATE INDEX `task_state_idx` ON `tasks` (`state`,`health`);