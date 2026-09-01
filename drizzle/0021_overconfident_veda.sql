CREATE TABLE `assistantChats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`pageRoute` varchar(200),
	`pageKind` varchar(40),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `assistantChats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `assistantChats` ADD CONSTRAINT `assistantChats_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `assistant_chats_user_idx` ON `assistantChats` (`userId`,`createdAt`);