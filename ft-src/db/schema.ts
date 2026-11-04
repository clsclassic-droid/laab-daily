// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import {sqliteTable,text,index,integer} from 'drizzle-orm/sqlite-core';
export const records=sqliteTable('records',{id:text('id').primaryKey(),kind:text('kind').notNull(),date:text('date').notNull(),payload:text('payload').notNull()},t=>[index('idx_records_date').on(t.date)]);
export const settings=sqliteTable('settings',{key:text('key').primaryKey(),value:text('value').notNull()});
export const backups=sqliteTable('backups',{id:text('id').primaryKey(),createdAt:text('created_at').notNull(),label:text('label').notNull(),settings:text('settings').notNull()});
export const backupRecords=sqliteTable('backup_records',{id:text('id').primaryKey(),backupId:text('backup_id').notNull().references(()=>backups.id),recordId:text('record_id').notNull(),kind:text('kind').notNull(),date:text('date').notNull(),payload:text('payload').notNull()},t=>[index('idx_backup_records_backup').on(t.backupId)]);

export const overviewCache=sqliteTable('overview_cache',{key:text('key').primaryKey(),revision:integer('revision').notNull(),payload:text('payload').notNull()});
