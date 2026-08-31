ALTER TABLE `skillPackages` ADD `submissionSource` enum('employee','admin_direct','agent') DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE `skillPackages` ADD `importBatchKey` varchar(80);--> statement-breakpoint
CREATE INDEX `skill_packages_import_batch_idx` ON `skillPackages` (`submissionSource`,`importBatchKey`,`createdAt`);