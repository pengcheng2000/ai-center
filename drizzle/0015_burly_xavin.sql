CREATE TABLE `skillDownloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skillId` int NOT NULL,
	`userId` int NOT NULL,
	`downloadCount` int NOT NULL DEFAULT 1,
	`firstDownloadedAt` timestamp NOT NULL DEFAULT (now()),
	`lastDownloadedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skillDownloads_id` PRIMARY KEY(`id`),
	CONSTRAINT `skill_downloads_user_skill_unique` UNIQUE(`userId`,`skillId`)
);
--> statement-breakpoint
CREATE TABLE `skillReviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`skillId` int NOT NULL,
	`userId` int NOT NULL,
	`rating` int NOT NULL,
	`comment` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `skillReviews_id` PRIMARY KEY(`id`),
	CONSTRAINT `skill_reviews_user_skill_unique` UNIQUE(`userId`,`skillId`)
);
--> statement-breakpoint
ALTER TABLE `skillDownloads` ADD CONSTRAINT `skillDownloads_skillId_skillPackages_id_fk` FOREIGN KEY (`skillId`) REFERENCES `skillPackages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skillDownloads` ADD CONSTRAINT `skillDownloads_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skillReviews` ADD CONSTRAINT `skillReviews_skillId_skillPackages_id_fk` FOREIGN KEY (`skillId`) REFERENCES `skillPackages`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `skillReviews` ADD CONSTRAINT `skillReviews_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `skill_downloads_user_idx` ON `skillDownloads` (`userId`,`lastDownloadedAt`);--> statement-breakpoint
CREATE INDEX `skill_reviews_skill_idx` ON `skillReviews` (`skillId`,`updatedAt`);