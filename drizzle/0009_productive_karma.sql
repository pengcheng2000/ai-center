ALTER TABLE `courses` ADD `contentOwner` varchar(120) DEFAULT '待指定' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `businessOwner` varchar(120) DEFAULT '待指定' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `reviewStatus` enum('current','due','overdue') DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `reviewDueAt` timestamp;--> statement-breakpoint
ALTER TABLE `courses` ADD `version` varchar(40) DEFAULT 'v1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `changeNote` text;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `contentOwner` varchar(120) DEFAULT '待指定' NOT NULL;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `businessOwner` varchar(120) DEFAULT '待指定' NOT NULL;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `reviewStatus` enum('current','due','overdue') DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `reviewDueAt` timestamp;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `version` varchar(40) DEFAULT 'v1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `changeNote` text;--> statement-breakpoint
CREATE INDEX `courses_review_idx` ON `courses` (`reviewStatus`,`reviewDueAt`);--> statement-breakpoint
CREATE INDEX `learning_paths_review_idx` ON `learningPaths` (`reviewStatus`,`reviewDueAt`);