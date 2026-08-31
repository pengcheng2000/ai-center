ALTER TABLE `newsItems` ADD `isDeleted` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `newsItems` ADD `deletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `newsItems` ADD `deletedBy` int;--> statement-breakpoint
ALTER TABLE `newsItems` ADD `deletionReason` text;--> statement-breakpoint
ALTER TABLE `newsItems` ADD CONSTRAINT `newsItems_deletedBy_users_id_fk` FOREIGN KEY (`deletedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `news_items_deleted_idx` ON `newsItems` (`isDeleted`,`updatedAt`);