ALTER TABLE `communityPosts` ADD `contentFormat` enum('html','markdown') DEFAULT 'html' NOT NULL;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `isDeleted` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `deletionReason` text;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `editedAt` timestamp;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD CONSTRAINT `communityPosts_deletedBy_users_id_fk` FOREIGN KEY (`deletedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `community_posts_deleted_idx` ON `communityPosts` (`isDeleted`,`createdAt`);