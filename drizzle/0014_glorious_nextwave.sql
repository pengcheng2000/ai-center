CREATE TABLE `skillPackages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skillKey` varchar(64) NOT NULL,
	`name` varchar(120) NOT NULL,
	`summary` varchar(360) NOT NULL,
	`description` text NOT NULL,
	`category` varchar(80) NOT NULL,
	`tags` json NOT NULL,
	`version` varchar(40) NOT NULL DEFAULT 'v1.0',
	`skillMd` text NOT NULL,
	`usageGuide` text NOT NULL,
	`packageStorageKey` varchar(600) NOT NULL,
	`packageFileName` varchar(180) NOT NULL,
	`packageSizeBytes` int NOT NULL,
	`authorId` int NOT NULL,
	`reviewStatus` enum('pending','approved','rejected','archived') NOT NULL DEFAULT 'pending',
	`reviewNote` text,
	`reviewedBy` int,
	`reviewedAt` timestamp,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skillPackages_id` PRIMARY KEY(`id`),
	CONSTRAINT `skill_packages_key_unique` UNIQUE(`skillKey`)
);
--> statement-breakpoint
ALTER TABLE `skillPackages` ADD CONSTRAINT `skillPackages_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skillPackages` ADD CONSTRAINT `skillPackages_reviewedBy_users_id_fk` FOREIGN KEY (`reviewedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `skill_packages_catalog_idx` ON `skillPackages` (`reviewStatus`,`category`,`publishedAt`);--> statement-breakpoint
CREATE INDEX `skill_packages_author_idx` ON `skillPackages` (`authorId`,`createdAt`);