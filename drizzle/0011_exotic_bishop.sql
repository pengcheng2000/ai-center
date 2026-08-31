CREATE TABLE `courseMaterialComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`userId` int NOT NULL,
	`content` text NOT NULL,
	`videoSecond` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `courseMaterialComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseMaterials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`courseId` int NOT NULL,
	`materialType` enum('document','video','practice') NOT NULL,
	`sourceType` enum('url','file','inline') NOT NULL DEFAULT 'url',
	`title` varchar(180) NOT NULL,
	`description` text,
	`sourceUrl` varchar(600),
	`storageKey` varchar(600),
	`mimeType` varchar(120),
	`content` text,
	`config` json NOT NULL,
	`orderIndex` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseMaterials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coursePracticeRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`userId` int NOT NULL,
	`modelId` varchar(120) NOT NULL,
	`prompt` text NOT NULL,
	`output` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coursePracticeRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `courseMaterialComments` ADD CONSTRAINT `courseMaterialComments_materialId_courseMaterials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `courseMaterials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseMaterialComments` ADD CONSTRAINT `courseMaterialComments_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseMaterials` ADD CONSTRAINT `courseMaterials_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coursePracticeRuns` ADD CONSTRAINT `coursePracticeRuns_materialId_courseMaterials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `courseMaterials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coursePracticeRuns` ADD CONSTRAINT `coursePracticeRuns_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `course_material_comments_material_idx` ON `courseMaterialComments` (`materialId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `course_materials_course_idx` ON `courseMaterials` (`courseId`,`orderIndex`);--> statement-breakpoint
CREATE INDEX `course_practice_runs_user_material_idx` ON `coursePracticeRuns` (`userId`,`materialId`,`createdAt`);