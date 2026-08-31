CREATE TABLE `agentImportAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importKeyId` int NOT NULL,
	`assetType` enum('image','document','package') NOT NULL,
	`sourceUrl` varchar(800),
	`storageKey` varchar(600) NOT NULL,
	`storageUrl` varchar(600) NOT NULL,
	`fileName` varchar(180) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`checksum` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentImportAssets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `agentImportJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importKeyId` int NOT NULL,
	`targetType` enum('news','course_material','skill') NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`sourceUrl` varchar(800) NOT NULL,
	`sourceTitle` varchar(300),
	`payload` json NOT NULL,
	`assetIds` json NOT NULL,
	`status` enum('pending_review','applied','rejected','failed') NOT NULL DEFAULT 'pending_review',
	`reviewNote` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`resultType` varchar(80),
	`resultId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `agentImportJobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_import_jobs_key_idempotency_unique` UNIQUE(`importKeyId`,`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `agentImportKeys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`tokenPrefix` varchar(28) NOT NULL,
	`tokenHash` varchar(128) NOT NULL,
	`allowedTargets` json NOT NULL,
	`createdBy` int NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 1,
	`lastUsedAt` timestamp,
	`expiresAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `agentImportKeys_id` PRIMARY KEY(`id`),
	CONSTRAINT `agent_import_keys_token_hash_unique` UNIQUE(`tokenHash`)
);
--> statement-breakpoint
ALTER TABLE `agentImportAssets` ADD CONSTRAINT `agentImportAssets_importKeyId_agentImportKeys_id_fk` FOREIGN KEY (`importKeyId`) REFERENCES `agentImportKeys`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentImportJobs` ADD CONSTRAINT `agentImportJobs_importKeyId_agentImportKeys_id_fk` FOREIGN KEY (`importKeyId`) REFERENCES `agentImportKeys`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentImportJobs` ADD CONSTRAINT `agentImportJobs_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `agentImportKeys` ADD CONSTRAINT `agentImportKeys_createdBy_users_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `agent_import_assets_key_idx` ON `agentImportAssets` (`importKeyId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agent_import_assets_checksum_idx` ON `agentImportAssets` (`checksum`);--> statement-breakpoint
CREATE INDEX `agent_import_jobs_status_idx` ON `agentImportJobs` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `agent_import_keys_active_idx` ON `agentImportKeys` (`isEnabled`,`expiresAt`);