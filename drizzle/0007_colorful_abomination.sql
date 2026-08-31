ALTER TABLE `newsSources` ADD `scheduleEnabled` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `newsSources` ADD `scheduleCronTaskUid` varchar(65);--> statement-breakpoint
ALTER TABLE `newsSources` ADD `scheduleLastRunAt` timestamp;--> statement-breakpoint
ALTER TABLE `newsSources` ADD `scheduleLastError` text;--> statement-breakpoint
CREATE INDEX `news_sources_schedule_task_idx` ON `newsSources` (`scheduleCronTaskUid`);