CREATE TABLE `contentPublications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`contentId` int NOT NULL,
	`channel` varchar(64) NOT NULL,
	`destinationKey` varchar(128) NOT NULL,
	`status` enum('approved','published','withdrawn') NOT NULL DEFAULT 'approved',
	`audienceType` enum('verified_employees','department','role','user') NOT NULL,
	`audienceRule` json,
	`approvedBy` int NOT NULL,
	`approvedAt` timestamp NOT NULL,
	`ownerConfirmedBy` varchar(160) NOT NULL,
	`ownerConfirmedAt` timestamp NOT NULL,
	`publishedAt` timestamp,
	`withdrawnBy` int,
	`withdrawnAt` timestamp,
	`withdrawReason` enum('manual','superseded','source_missing','access_lost','cancelled'),
	`supersedesPublicationId` int,
	`activeSlotKey` varchar(64),
	`sortOrder` int NOT NULL DEFAULT 0,
	`isFeatured` int NOT NULL DEFAULT 0,
	`targetType` varchar(64),
	`targetId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contentPublications_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_publications_active_slot_unique` UNIQUE(`activeSlotKey`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeAssets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contentId` int NOT NULL,
	`assetRef` varchar(128) NOT NULL,
	`kind` enum('inline_image','attachment','primary_file') NOT NULL,
	`externalToken` varchar(255),
	`fileName` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`sizeBytes` int NOT NULL,
	`sha256` varchar(64) NOT NULL,
	`storageKey` varchar(600) NOT NULL,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `knowledgeAssets_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_assets_content_ref_unique` UNIQUE(`contentId`,`assetRef`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeContents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`itemId` int NOT NULL,
	`sourceRunId` int NOT NULL,
	`versionNo` int NOT NULL,
	`ingestStatus` enum('staging','ready') NOT NULL DEFAULT 'staging',
	`format` enum('markdown','html','structured','binary') NOT NULL,
	`titleSnapshot` varchar(500) NOT NULL,
	`summary` varchar(1000),
	`bodyMarkdown` longtext,
	`bodyHtml` longtext,
	`structuredData` json,
	`structuredStorageKey` varchar(600),
	`structuredSchema` json,
	`structuredPreview` json,
	`rowCount` int,
	`columnCount` int,
	`contentHash` varchar(64) NOT NULL,
	`rawHash` varchar(64) NOT NULL,
	`normalizerVersion` varchar(64) NOT NULL,
	`sourceRevision` varchar(128),
	`rawSnapshotStorageKey` varchar(600),
	`stagingPrefix` varchar(600),
	`renderStatus` enum('complete','incomplete','preview_only') NOT NULL DEFAULT 'complete',
	`unsupportedSummary` json,
	`locatorMap` json,
	`locatorTruncated` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readyAt` timestamp,
	CONSTRAINT `knowledgeContents_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_contents_item_version_unique` UNIQUE(`itemId`,`versionNo`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`externalId` varchar(255) NOT NULL,
	`parentItemId` int,
	`kind` enum('docx','file','sheet','bitable','shortcut') NOT NULL,
	`objType` varchar(64),
	`objToken` varchar(255),
	`originSpaceId` varchar(255),
	`originNodeToken` varchar(255),
	`originObjToken` varchar(255),
	`title` varchar(500) NOT NULL,
	`authorName` varchar(180),
	`sourceUrl` varchar(1000),
	`sourceUpdatedAt` timestamp,
	`syncedAt` timestamp,
	`lastSeenRunId` int,
	`sourceAccessStatus` enum('unknown','accessible','access_lost') NOT NULL DEFAULT 'unknown',
	`sourceAclMetadata` json,
	`syncStatus` enum('active','content_failed','unsupported','missing') NOT NULL DEFAULT 'active',
	`lastContentErrorCode` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_items_source_external_unique` UNIQUE(`sourceId`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`connectorKey` varchar(64) NOT NULL,
	`externalId` varchar(255) NOT NULL,
	`name` varchar(180) NOT NULL,
	`config` json NOT NULL,
	`credentialRef` varchar(128),
	`isEnabled` int NOT NULL DEFAULT 1,
	`sourceAccessStatus` enum('unknown','accessible','access_lost') NOT NULL DEFAULT 'unknown',
	`sourceAclMetadata` json,
	`scheduleEnabled` int NOT NULL DEFAULT 0,
	`syncIntervalHours` int NOT NULL DEFAULT 24,
	`scheduleCronTaskUid` varchar(65),
	`leaseToken` varchar(64),
	`leaseExpiresAt` timestamp,
	`lastDirectorySyncAt` timestamp,
	`lastSuccessfulSyncAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `knowledgeSources_id` PRIMARY KEY(`id`),
	CONSTRAINT `knowledge_sources_connector_external_unique` UNIQUE(`connectorKey`,`externalId`)
);
--> statement-breakpoint
CREATE TABLE `knowledgeSyncRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sourceId` int NOT NULL,
	`trigger` enum('manual','scheduled') NOT NULL,
	`scope` enum('full') NOT NULL DEFAULT 'full',
	`status` enum('running','succeeded','partial','failed','abandoned') NOT NULL DEFAULT 'running',
	`leaseToken` varchar(64) NOT NULL,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`finishedAt` timestamp,
	`directoryTraversalComplete` int NOT NULL DEFAULT 0,
	`contentFetchComplete` int NOT NULL DEFAULT 0,
	`reconciliationComplete` int NOT NULL DEFAULT 0,
	`discoveredCount` int NOT NULL DEFAULT 0,
	`createdCount` int NOT NULL DEFAULT 0,
	`updatedCount` int NOT NULL DEFAULT 0,
	`unchangedCount` int NOT NULL DEFAULT 0,
	`contentFailedCount` int NOT NULL DEFAULT 0,
	`unsupportedCount` int NOT NULL DEFAULT 0,
	`missingCount` int NOT NULL DEFAULT 0,
	`assetLimitCount` int NOT NULL DEFAULT 0,
	`bytesWritten` int NOT NULL DEFAULT 0,
	`failures` json NOT NULL,
	`pagination` json,
	CONSTRAINT `knowledgeSyncRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `enterpriseAccessStatus` enum('unverified','verified','revoked') DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `enterpriseVerifiedBy` int;--> statement-breakpoint
ALTER TABLE `users` ADD `enterpriseVerifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `enterpriseRevokedAt` timestamp;--> statement-breakpoint
ALTER TABLE `contentPublications` ADD CONSTRAINT `contentPublications_itemId_knowledgeItems_id_fk` FOREIGN KEY (`itemId`) REFERENCES `knowledgeItems`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentPublications` ADD CONSTRAINT `contentPublications_contentId_knowledgeContents_id_fk` FOREIGN KEY (`contentId`) REFERENCES `knowledgeContents`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentPublications` ADD CONSTRAINT `contentPublications_approvedBy_users_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentPublications` ADD CONSTRAINT `contentPublications_withdrawnBy_users_id_fk` FOREIGN KEY (`withdrawnBy`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contentPublications` ADD CONSTRAINT `content_pub_supersedes_fk` FOREIGN KEY (`supersedesPublicationId`) REFERENCES `contentPublications`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeAssets` ADD CONSTRAINT `knowledgeAssets_contentId_knowledgeContents_id_fk` FOREIGN KEY (`contentId`) REFERENCES `knowledgeContents`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeContents` ADD CONSTRAINT `knowledgeContents_itemId_knowledgeItems_id_fk` FOREIGN KEY (`itemId`) REFERENCES `knowledgeItems`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeContents` ADD CONSTRAINT `knowledgeContents_sourceRunId_knowledgeSyncRuns_id_fk` FOREIGN KEY (`sourceRunId`) REFERENCES `knowledgeSyncRuns`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeItems` ADD CONSTRAINT `knowledgeItems_sourceId_knowledgeSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `knowledgeSources`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeItems` ADD CONSTRAINT `knowledgeItems_parentItemId_knowledgeItems_id_fk` FOREIGN KEY (`parentItemId`) REFERENCES `knowledgeItems`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeItems` ADD CONSTRAINT `knowledgeItems_lastSeenRunId_knowledgeSyncRuns_id_fk` FOREIGN KEY (`lastSeenRunId`) REFERENCES `knowledgeSyncRuns`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `knowledgeSyncRuns` ADD CONSTRAINT `knowledgeSyncRuns_sourceId_knowledgeSources_id_fk` FOREIGN KEY (`sourceId`) REFERENCES `knowledgeSources`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `content_publications_item_channel_status_idx` ON `contentPublications` (`itemId`,`channel`,`status`);--> statement-breakpoint
CREATE INDEX `content_publications_channel_status_order_idx` ON `contentPublications` (`channel`,`status`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `content_publications_content_idx` ON `contentPublications` (`contentId`);--> statement-breakpoint
CREATE INDEX `knowledge_assets_content_idx` ON `knowledgeAssets` (`contentId`);--> statement-breakpoint
CREATE INDEX `knowledge_contents_item_created_idx` ON `knowledgeContents` (`itemId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `knowledge_contents_run_ingest_idx` ON `knowledgeContents` (`sourceRunId`,`ingestStatus`);--> statement-breakpoint
CREATE INDEX `knowledge_items_source_parent_idx` ON `knowledgeItems` (`sourceId`,`parentItemId`);--> statement-breakpoint
CREATE INDEX `knowledge_items_source_status_idx` ON `knowledgeItems` (`sourceId`,`syncStatus`);--> statement-breakpoint
CREATE INDEX `knowledge_items_source_seen_idx` ON `knowledgeItems` (`sourceId`,`lastSeenRunId`);--> statement-breakpoint
CREATE INDEX `knowledge_items_source_access_idx` ON `knowledgeItems` (`sourceId`,`sourceAccessStatus`);--> statement-breakpoint
CREATE INDEX `knowledge_sources_schedule_idx` ON `knowledgeSources` (`scheduleEnabled`,`isEnabled`);--> statement-breakpoint
CREATE INDEX `knowledge_sources_lease_idx` ON `knowledgeSources` (`leaseExpiresAt`);--> statement-breakpoint
CREATE INDEX `knowledge_sync_runs_source_started_idx` ON `knowledgeSyncRuns` (`sourceId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `knowledge_sync_runs_source_status_idx` ON `knowledgeSyncRuns` (`sourceId`,`status`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_enterpriseVerifiedBy_users_id_fk` FOREIGN KEY (`enterpriseVerifiedBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
