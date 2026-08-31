CREATE TABLE `postComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorId` int NOT NULL,
	`postId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `postComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `postComments` ADD CONSTRAINT `postComments_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `postComments` ADD CONSTRAINT `postComments_postId_communityPosts_id_fk` FOREIGN KEY (`postId`) REFERENCES `communityPosts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `post_comments_post_idx` ON `postComments` (`postId`,`createdAt`);