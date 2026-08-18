CREATE TABLE `quality_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`initiativeId` int NOT NULL,
	`version` int NOT NULL DEFAULT 1,
	`outcome` text NOT NULL,
	`contractJson` text NOT NULL,
	`criticJson` text,
	`ambiguityScore` int NOT NULL DEFAULT 0,
	`decision` enum('draft','approved','revise','human_review') NOT NULL DEFAULT 'draft',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`contractId` int,
	`templateVersion` varchar(40) NOT NULL,
	`promptDigest` varchar(128) NOT NULL,
	`promptText` text NOT NULL,
	`twinJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `quality_prompt_digest_unique` UNIQUE(`promptDigest`)
);
--> statement-breakpoint
CREATE TABLE `quality_recoveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`domain` enum('contract','prompt','scope','environment','implementation','provider_uncertainty') NOT NULL,
	`recommendation` text NOT NULL,
	`autoRetryEligible` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_recoveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quality_verifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`verdict` enum('accepted','conditionally_accepted','failed_verification','needs_human_review','provider_failed') NOT NULL,
	`deterministicJson` text NOT NULL,
	`evidenceJson` text NOT NULL,
	`adversarialJson` text,
	`summary` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quality_verifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `quality_contract_initiative_idx` ON `quality_contracts` (`initiativeId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `quality_prompt_task_idx` ON `quality_prompts` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `quality_recovery_task_idx` ON `quality_recoveries` (`taskId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `quality_verification_task_idx` ON `quality_verifications` (`taskId`,`createdAt`);