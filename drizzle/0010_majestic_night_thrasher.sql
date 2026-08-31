CREATE TABLE `newsReadEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`newsId` int NOT NULL,
	`firstReadAt` timestamp NOT NULL DEFAULT (now()),
	`lastReadAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsReadEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `news_read_user_news_unique` UNIQUE(`userId`,`newsId`)
);
--> statement-breakpoint
ALTER TABLE `newsReadEvents` ADD CONSTRAINT `newsReadEvents_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsReadEvents` ADD CONSTRAINT `newsReadEvents_newsId_newsItems_id_fk` FOREIGN KEY (`newsId`) REFERENCES `newsItems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `news_read_news_idx` ON `newsReadEvents` (`newsId`);