ALTER TABLE `llmProviders` MODIFY COLUMN `providerType` enum('openai','anthropic','azure_openai','custom') NOT NULL DEFAULT 'custom';--> statement-breakpoint
ALTER TABLE `users` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `users` ADD `passwordHash` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_username_unique` UNIQUE(`username`);