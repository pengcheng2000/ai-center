CREATE TABLE `postFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`postId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postFavorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_favorites_user_post_unique` UNIQUE(`userId`,`postId`)
);
--> statement-breakpoint
ALTER TABLE `postFavorites` ADD CONSTRAINT `postFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `postFavorites` ADD CONSTRAINT `postFavorites_postId_communityPosts_id_fk` FOREIGN KEY (`postId`) REFERENCES `communityPosts`(`id`) ON DELETE cascade ON UPDATE no action;