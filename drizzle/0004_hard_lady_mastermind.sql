CREATE TABLE `session_controls` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`julesSessionName` varchar(128),
	`controlType` enum('refresh','approve_plan','send_message','request_delete','set_local_hold','release_local_hold','reconcile','export_dossier') NOT NULL,
	`requestedBy` int NOT NULL,
	`idempotencyKey` varchar(160) NOT NULL,
	`inputDigest` varchar(128) NOT NULL,
	`reason` text,
	`preconditionSnapshot` text NOT NULL,
	`status` enum('pending','succeeded','failed','timed_out','unknown','superseded') NOT NULL DEFAULT 'pending',
	`providerRequestId` varchar(128),
	`sentAt` timestamp,
	`completedAt` timestamp,
	`errorCode` varchar(80),
	`errorMessage` varchar(500),
	`responseDigest` varchar(128),
	`stateBefore` varchar(80),
	`stateAfter` varchar(80),
	`eventId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_controls_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_control_idempotency_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `session_monitor_checkpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`julesSessionName` varchar(128) NOT NULL,
	`lastActivityId` varchar(160),
	`latestProviderUpdateTime` timestamp,
	`observedState` varchar(80),
	`lastSuccessfulAt` timestamp,
	`lastAttemptAt` timestamp,
	`nextRecommendedPollAt` timestamp,
	`errorStreak` int NOT NULL DEFAULT 0,
	`lastError` varchar(500),
	`lastLatencyMs` int,
	`responseDigest` varchar(128),
	`monitorVersion` varchar(40) NOT NULL DEFAULT 'session-monitor-v1',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `session_monitor_checkpoints_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_monitor_task_unique` UNIQUE(`taskId`)
);
--> statement-breakpoint
CREATE TABLE `task_control_leases` (
	`taskId` int NOT NULL,
	`heldBy` int NOT NULL,
	`controlDigest` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_control_leases_taskId` PRIMARY KEY(`taskId`)
);
--> statement-breakpoint
ALTER TABLE `task_events` ADD `providerActivityId` varchar(160);--> statement-breakpoint
ALTER TABLE `tasks` ADD `localHold` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `localHoldReason` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `localHoldAt` timestamp;--> statement-breakpoint
ALTER TABLE `tasks` ADD `localHoldBy` int;--> statement-breakpoint
ALTER TABLE `task_events` ADD CONSTRAINT `task_event_activity_unique` UNIQUE(`taskId`,`providerActivityId`);--> statement-breakpoint
CREATE INDEX `session_control_task_idx` ON `session_controls` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `session_monitor_session_idx` ON `session_monitor_checkpoints` (`julesSessionName`);