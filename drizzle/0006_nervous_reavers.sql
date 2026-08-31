ALTER TABLE `communityTopics` ADD `reviewStatus` enum('current','due','overdue') DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE `llmProviders` ADD `reviewStatus` enum('current','due','overdue') DEFAULT 'current' NOT NULL;--> statement-breakpoint
ALTER TABLE `newsSources` ADD `reviewStatus` enum('current','due','overdue') DEFAULT 'current' NOT NULL;