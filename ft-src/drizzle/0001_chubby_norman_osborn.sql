CREATE TABLE `backup_records` (
	`id` text PRIMARY KEY NOT NULL,
	`backup_id` text NOT NULL,
	`record_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`backup_id`) REFERENCES `backups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_backup_records_backup` ON `backup_records` (`backup_id`);--> statement-breakpoint
CREATE TABLE `backups` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`label` text NOT NULL,
	`settings` text NOT NULL
);
