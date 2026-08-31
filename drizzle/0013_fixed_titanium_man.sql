CREATE TABLE `enterpriseApps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` varchar(500) NOT NULL,
	`appUrl` varchar(600) NOT NULL,
	`category` varchar(80) NOT NULL,
	`icon` varchar(48) NOT NULL DEFAULT 'blocks',
	`audience` enum('all','employee','admin') NOT NULL DEFAULT 'employee',
	`isEnabled` int NOT NULL DEFAULT 1,
	`orderIndex` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enterpriseApps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `llmProviders` ADD `gatewayStatus` enum('not_connected','verified','failed') DEFAULT 'not_connected' NOT NULL;--> statement-breakpoint
ALTER TABLE `llmProviders` ADD `gatewayCheckedAt` timestamp;--> statement-breakpoint
ALTER TABLE `llmProviders` ADD `gatewayLastError` varchar(600);--> statement-breakpoint
CREATE INDEX `enterprise_apps_visible_idx` ON `enterpriseApps` (`isEnabled`,`audience`,`orderIndex`);