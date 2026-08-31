CREATE TABLE `postAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`postId` int,
	`fileKey` varchar(560) NOT NULL,
	`url` varchar(600) NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `contentHtml` text;--> statement-breakpoint
ALTER TABLE `postAttachments` ADD CONSTRAINT `postAttachments_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `postAttachments` ADD CONSTRAINT `postAttachments_postId_communityPosts_id_fk` FOREIGN KEY (`postId`) REFERENCES `communityPosts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `post_attachments_post_idx` ON `postAttachments` (`postId`);--> statement-breakpoint
CREATE INDEX `post_attachments_owner_idx` ON `postAttachments` (`ownerId`,`postId`);