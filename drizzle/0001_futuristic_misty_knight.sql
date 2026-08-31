CREATE TABLE `auditAgents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text NOT NULL,
	`modelPreference` varchar(120) NOT NULL DEFAULT 'gpt-5-mini',
	`confidenceThreshold` int NOT NULL DEFAULT 72,
	`isEnabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auditAgents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditRecords` (
	`id` int AUTO_INCREMENT NOT NULL,
	`newsId` int NOT NULL,
	`agentId` int,
	`decision` enum('approved','needs_review','rejected') NOT NULL,
	`riskLevel` enum('low','medium','high','critical') NOT NULL,
	`confidence` int NOT NULL,
	`reason` text NOT NULL,
	`matchedRules` json NOT NULL,
	`reviewerId` int,
	`reviewNote` text,
	`reviewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentId` int,
	`name` varchar(140) NOT NULL,
	`description` text NOT NULL,
	`riskLevel` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`keywords` json NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `auditRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `communityPosts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorId` int NOT NULL,
	`postType` enum('experience','question','resource','discussion') NOT NULL DEFAULT 'discussion',
	`title` varchar(180) NOT NULL,
	`content` text NOT NULL,
	`tags` json NOT NULL,
	`isPinned` int NOT NULL DEFAULT 0,
	`likeCount` int NOT NULL DEFAULT 0,
	`commentCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `communityPosts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`courseId` int NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_progress_user_course_unique` UNIQUE(`userId`,`courseId`)
);
--> statement-breakpoint
CREATE TABLE `courses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pathId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`summary` text NOT NULL,
	`duration` varchar(32) NOT NULL,
	`orderIndex` int NOT NULL DEFAULT 0,
	`resourceType` enum('video','article','exercise','template') NOT NULL DEFAULT 'article',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `courses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `featureModules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleKey` varchar(64) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` varchar(240) NOT NULL,
	`destination` varchar(320) NOT NULL,
	`icon` varchar(48) NOT NULL DEFAULT 'grid',
	`audience` enum('all','employee','admin') NOT NULL DEFAULT 'employee',
	`isEnabled` int NOT NULL DEFAULT 1,
	`orderIndex` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `featureModules_id` PRIMARY KEY(`id`),
	CONSTRAINT `feature_modules_key_unique` UNIQUE(`moduleKey`)
);
--> statement-breakpoint
CREATE TABLE `learningPaths` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`description` text NOT NULL,
	`level` enum('beginner','intermediate','advanced') NOT NULL DEFAULT 'beginner',
	`category` varchar(80) NOT NULL,
	`duration` varchar(40) NOT NULL,
	`lessonCount` int NOT NULL DEFAULT 0,
	`accent` varchar(24) NOT NULL DEFAULT 'violet',
	`tags` json NOT NULL,
	`isFeatured` int NOT NULL DEFAULT 0,
	`isPublished` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `learningPaths_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsFavorites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`newsId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsFavorites_id` PRIMARY KEY(`id`),
	CONSTRAINT `news_favorites_user_news_unique` UNIQUE(`userId`,`newsId`)
);
--> statement-breakpoint
CREATE TABLE `newsItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int,
	`title` varchar(240) NOT NULL,
	`summary` text NOT NULL,
	`content` text,
	`sourceUrl` varchar(500),
	`category` varchar(80) NOT NULL,
	`tags` json NOT NULL,
	`reviewStatus` enum('draft','pending','approved','needs_review','rejected') NOT NULL DEFAULT 'pending',
	`riskLevel` enum('low','medium','high','critical') NOT NULL DEFAULT 'low',
	`isFeatured` int NOT NULL DEFAULT 0,
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(140) NOT NULL,
	`url` varchar(500) NOT NULL,
	`sourceType` enum('rss','website','api','manual') NOT NULL DEFAULT 'manual',
	`category` varchar(80) NOT NULL,
	`description` text,
	`isEnabled` int NOT NULL DEFAULT 1,
	`lastProcessedAt` timestamp,
	`totalProcessed` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `newsSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `postLikes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`postId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `postLikes_id` PRIMARY KEY(`id`),
	CONSTRAINT `post_likes_user_post_unique` UNIQUE(`userId`,`postId`)
);
--> statement-breakpoint
CREATE TABLE `userProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`headline` varchar(180) NOT NULL DEFAULT '正在构建自己的 AI 工作方式',
	`department` varchar(120),
	`roleTitle` varchar(120),
	`abilityTags` json NOT NULL,
	`interestTags` json NOT NULL,
	`growthGoals` json NOT NULL,
	`weeklyLearningMinutes` int NOT NULL DEFAULT 0,
	`learningStreak` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `workspaceItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(100) NOT NULL,
	`description` varchar(240) NOT NULL,
	`destination` varchar(320) NOT NULL,
	`icon` varchar(48) NOT NULL DEFAULT 'sparkles',
	`color` varchar(24) NOT NULL DEFAULT 'violet',
	`orderIndex` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `workspaceItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `auditRecords` ADD CONSTRAINT `auditRecords_newsId_newsItems_id_fk` FOREIGN KEY (`newsId`) REFERENCES `newsItems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditRecords` ADD CONSTRAINT `auditRecords_agentId_auditAgents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `auditAgents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditRecords` ADD CONSTRAINT `auditRecords_reviewerId_users_id_fk` FOREIGN KEY (`reviewerId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auditRules` ADD CONSTRAINT `auditRules_agentId_auditAgents_id_fk` FOREIGN KEY (`agentId`) REFERENCES `auditAgents`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD CONSTRAINT `communityPosts_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseProgress` ADD CONSTRAINT `courseProgress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseProgress` ADD CONSTRAINT `courseProgress_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courses` ADD CONSTRAINT `courses_pathId_learningPaths_id_fk` FOREIGN KEY (`pathId`) REFERENCES `learningPaths`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsFavorites` ADD CONSTRAINT `newsFavorites_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsFavorites` ADD CONSTRAINT `newsFavorites_newsId_newsItems_id_fk` FOREIGN KEY (`newsId`) REFERENCES `newsItems`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `newsItems` ADD CONSTRAINT `newsItems_sourceId_newsSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `newsSources`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `postLikes` ADD CONSTRAINT `postLikes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `postLikes` ADD CONSTRAINT `postLikes_postId_communityPosts_id_fk` FOREIGN KEY (`postId`) REFERENCES `communityPosts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `userProfiles` ADD CONSTRAINT `userProfiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `workspaceItems` ADD CONSTRAINT `workspaceItems_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_records_news_idx` ON `auditRecords` (`newsId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `audit_records_decision_idx` ON `auditRecords` (`decision`,`riskLevel`);--> statement-breakpoint
CREATE INDEX `audit_rules_agent_idx` ON `auditRules` (`agentId`,`isEnabled`);--> statement-breakpoint
CREATE INDEX `community_posts_recent_idx` ON `communityPosts` (`createdAt`);--> statement-breakpoint
CREATE INDEX `community_posts_type_idx` ON `communityPosts` (`postType`);--> statement-breakpoint
CREATE INDEX `courses_path_idx` ON `courses` (`pathId`,`orderIndex`);--> statement-breakpoint
CREATE INDEX `feature_modules_visible_idx` ON `featureModules` (`isEnabled`,`orderIndex`);--> statement-breakpoint
CREATE INDEX `learning_paths_category_idx` ON `learningPaths` (`category`);--> statement-breakpoint
CREATE INDEX `news_items_status_idx` ON `newsItems` (`reviewStatus`,`category`);--> statement-breakpoint
CREATE INDEX `news_sources_category_idx` ON `newsSources` (`category`);--> statement-breakpoint
CREATE INDEX `workspace_items_user_idx` ON `workspaceItems` (`userId`,`orderIndex`);