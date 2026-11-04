CREATE TABLE `overview_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL
);

--> statement-breakpoint
CREATE TRIGGER overview_invalidate_records_insert AFTER INSERT ON records
BEGIN
 INSERT INTO settings(key,value) VALUES('overview-revision-v1','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT);
END;

--> statement-breakpoint
CREATE TRIGGER overview_invalidate_records_update AFTER UPDATE ON records
BEGIN
 INSERT INTO settings(key,value) VALUES('overview-revision-v1','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT);
END;

--> statement-breakpoint
CREATE TRIGGER overview_invalidate_records_delete AFTER DELETE ON records
BEGIN
 INSERT INTO settings(key,value) VALUES('overview-revision-v1','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT);
END;

--> statement-breakpoint
CREATE TRIGGER overview_invalidate_settings_insert AFTER INSERT ON settings WHEN NEW.key IN ('business-v1','opening','import-v1','excel-receipts-v1')
BEGIN
 INSERT INTO settings(key,value) VALUES('overview-revision-v1','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT);
END;

--> statement-breakpoint
CREATE TRIGGER overview_invalidate_settings_update AFTER UPDATE ON settings WHEN NEW.key IN ('business-v1','opening','import-v1','excel-receipts-v1')
BEGIN
 INSERT INTO settings(key,value) VALUES('overview-revision-v1','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT);
END;

--> statement-breakpoint
CREATE TRIGGER overview_invalidate_settings_delete AFTER DELETE ON settings WHEN OLD.key IN ('business-v1','opening','import-v1','excel-receipts-v1')
BEGIN
 INSERT INTO settings(key,value) VALUES('overview-revision-v1','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT);
END;
