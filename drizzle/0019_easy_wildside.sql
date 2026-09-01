CREATE TABLE `aiIllustrations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`courseId` int,
	`prompt` varchar(360) NOT NULL,
	`storageKey` varchar(600) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiIllustrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseMaterialAnnotations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`materialId` int NOT NULL,
	`userId` int NOT NULL,
	`page` int NOT NULL DEFAULT 1,
	`rects` json NOT NULL,
	`note` text NOT NULL,
	`color` varchar(16) NOT NULL DEFAULT 'amber',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseMaterialAnnotations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `courseMaterialProgress` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`materialId` int NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`percent` int NOT NULL DEFAULT 0,
	`minutes` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `courseMaterialProgress_id` PRIMARY KEY(`id`),
	CONSTRAINT `course_material_progress_user_material_unique` UNIQUE(`userId`,`materialId`)
);
--> statement-breakpoint
ALTER TABLE `courseProgress` ADD `lastMaterialId` int;--> statement-breakpoint
ALTER TABLE `aiIllustrations` ADD CONSTRAINT `aiIllustrations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `aiIllustrations` ADD CONSTRAINT `aiIllustrations_courseId_courses_id_fk` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseMaterialAnnotations` ADD CONSTRAINT `courseMaterialAnnotations_materialId_courseMaterials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `courseMaterials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseMaterialAnnotations` ADD CONSTRAINT `courseMaterialAnnotations_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseMaterialProgress` ADD CONSTRAINT `courseMaterialProgress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `courseMaterialProgress` ADD CONSTRAINT `courseMaterialProgress_materialId_courseMaterials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `courseMaterials`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_illustrations_user_idx` ON `aiIllustrations` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `course_material_annotations_material_idx` ON `courseMaterialAnnotations` (`materialId`,`userId`,`page`);--> statement-breakpoint
ALTER TABLE `courseProgress` ADD CONSTRAINT `courseProgress_lastMaterialId_courseMaterials_id_fk` FOREIGN KEY (`lastMaterialId`) REFERENCES `courseMaterials`(`id`) ON DELETE set null ON UPDATE no action;