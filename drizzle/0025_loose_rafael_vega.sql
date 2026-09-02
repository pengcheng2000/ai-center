ALTER TABLE `courseMaterials` ADD `contentHtml` text;--> statement-breakpoint
ALTER TABLE `courseMaterials` ADD `contentFormat` enum('html','markdown','plain') DEFAULT 'markdown' NOT NULL;