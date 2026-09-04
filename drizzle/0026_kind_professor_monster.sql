CREATE TABLE `newsDigestSettings` (
	`id` int NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 0,
	`intervalHours` int NOT NULL DEFAULT 24,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`lastGeneratedAt` timestamp,
	`lastError` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsDigestSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsDigests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` text NOT NULL,
	`itemCount` int NOT NULL DEFAULT 0,
	`generatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsDigests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `newsItems` ADD `digestId` int;--> statement-breakpoint
ALTER TABLE `newsSources` ADD `syncIntervalHours` int DEFAULT 24 NOT NULL;--> statement-breakpoint
CREATE INDEX `news_digest_settings_task_idx` ON `newsDigestSettings` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `news_digests_generated_idx` ON `newsDigests` (`generatedAt`);--> statement-breakpoint
ALTER TABLE `newsItems` ADD CONSTRAINT `newsItems_digestId_newsDigests_id_fk` FOREIGN KEY (`digestId`) REFERENCES `newsDigests`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `news_items_digest_idx` ON `newsItems` (`digestId`);--> statement-breakpoint
INSERT INTO `newsDigestSettings` (`id`, `isEnabled`, `intervalHours`) VALUES (1, 0, 24)
ON DUPLICATE KEY UPDATE `id` = VALUES(`id`);
