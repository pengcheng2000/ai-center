ALTER TABLE `auditAgents` ADD `selectedModelId` int;--> statement-breakpoint
UPDATE `auditAgents`
SET `selectedModelId` = (
  SELECT `id`
  FROM `llmModels`
  WHERE `llmModels`.`modelId` = `auditAgents`.`modelPreference`
    AND `llmModels`.`isEnabled` = 1
  ORDER BY `llmModels`.`isDefault` DESC, `llmModels`.`orderIndex` ASC
  LIMIT 1
)
WHERE `selectedModelId` IS NULL;--> statement-breakpoint
ALTER TABLE `auditAgents` ADD CONSTRAINT `auditAgents_selectedModelId_llmModels_id_fk` FOREIGN KEY (`selectedModelId`) REFERENCES `llmModels`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_agents_selected_model_idx` ON `auditAgents` (`selectedModelId`);
