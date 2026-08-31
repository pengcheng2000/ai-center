CREATE TABLE `communityTopicFollows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`topicId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `communityTopicFollows_id` PRIMARY KEY(`id`),
	CONSTRAINT `community_topic_follow_unique` UNIQUE(`userId`,`topicId`)
);
--> statement-breakpoint
CREATE TABLE `communityTopics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(80) NOT NULL,
	`description` varchar(280) NOT NULL,
	`color` varchar(24) NOT NULL DEFAULT 'violet',
	`isEnabled` int NOT NULL DEFAULT 1,
	`isFeatured` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `communityTopics_id` PRIMARY KEY(`id`),
	CONSTRAINT `community_topics_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `llmModels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`providerId` int NOT NULL,
	`modelId` varchar(160) NOT NULL,
	`displayName` varchar(160) NOT NULL,
	`capabilityTags` json NOT NULL,
	`scenarioTags` json NOT NULL,
	`contextWindow` int NOT NULL DEFAULT 0,
	`isDefault` int NOT NULL DEFAULT 0,
	`isEnabled` int NOT NULL DEFAULT 1,
	`orderIndex` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llmModels_id` PRIMARY KEY(`id`),
	CONSTRAINT `llm_models_provider_model_unique` UNIQUE(`providerId`,`modelId`)
);
--> statement-breakpoint
CREATE TABLE `llmProviders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`providerType` enum('manus','openai','anthropic','azure_openai','custom') NOT NULL DEFAULT 'custom',
	`baseUrl` varchar(600) NOT NULL,
	`keyAlias` varchar(120) NOT NULL,
	`healthStatus` enum('unknown','healthy','degraded','disabled') NOT NULL DEFAULT 'unknown',
	`isEnabled` int NOT NULL DEFAULT 1,
	`orderIndex` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `llmProviders_id` PRIMARY KEY(`id`),
	CONSTRAINT `llm_providers_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `modelRoutingPolicies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`scenario` enum('default','audit','learning','content') NOT NULL DEFAULT 'default',
	`primaryModelId` int,
	`fallbackModelIds` json NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modelRoutingPolicies_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_policy_scenario_unique` UNIQUE(`scenario`)
);
--> statement-breakpoint
ALTER TABLE `auditRecords` ADD `reviewAssigneeId` int;--> statement-breakpoint
ALTER TABLE `auditRecords` ADD `manualDecision` enum('approved','needs_review','rejected');--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `quotePostId` int;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `replyPolicy` enum('all','mentioned','experts','operations') DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE `communityPosts` ADD `isFeatured` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `resourceUrl` varchar(600);--> statement-breakpoint
ALTER TABLE `courses` ADD `tags` json NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `prerequisiteCourseIds` json NOT NULL;--> statement-breakpoint
ALTER TABLE `courses` ADD `lifecycleStatus` enum('draft','published','archived') DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `prerequisitePathIds` json NOT NULL;--> statement-breakpoint
ALTER TABLE `learningPaths` ADD `lifecycleStatus` enum('draft','published','archived') DEFAULT 'published' NOT NULL;--> statement-breakpoint
ALTER TABLE `communityTopicFollows` ADD CONSTRAINT `communityTopicFollows_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `communityTopicFollows` ADD CONSTRAINT `communityTopicFollows_topicId_communityTopics_id_fk` FOREIGN KEY (`topicId`) REFERENCES `communityTopics`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `llmModels` ADD CONSTRAINT `llmModels_providerId_llmProviders_id_fk` FOREIGN KEY (`providerId`) REFERENCES `llmProviders`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `modelRoutingPolicies` ADD CONSTRAINT `modelRoutingPolicies_primaryModelId_llmModels_id_fk` FOREIGN KEY (`primaryModelId`) REFERENCES `llmModels`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `community_topics_visible_idx` ON `communityTopics` (`isEnabled`,`isFeatured`);--> statement-breakpoint
CREATE INDEX `llm_models_enabled_idx` ON `llmModels` (`isEnabled`,`orderIndex`);--> statement-breakpoint
CREATE INDEX `llm_providers_enabled_idx` ON `llmProviders` (`isEnabled`,`orderIndex`);--> statement-breakpoint
ALTER TABLE `auditRecords` ADD CONSTRAINT `auditRecords_reviewAssigneeId_users_id_fk` FOREIGN KEY (`reviewAssigneeId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
