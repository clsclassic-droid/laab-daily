// These statements run in one D1 batch, so records and settings share a snapshot.
export const captureMeta="INSERT INTO backups(id,created_at,label,settings) SELECT ?,?,?,COALESCE((SELECT json_group_object(key,value) FROM settings WHERE key IN ('opening','import-v1','business-v1','expenses-v1')), '{}')";
export const captureRecords="INSERT INTO backup_records(id,backup_id,record_id,kind,date,payload) SELECT ? || ':' || id,?,id,kind,date,payload FROM records";
export const restoreRecords="INSERT INTO records(id,kind,date,payload) SELECT record_id,kind,date,payload FROM backup_records WHERE backup_id=?";
export const restoreSettings="INSERT INTO settings(key,value) SELECT key,value FROM json_each((SELECT settings FROM backups WHERE id=?))";
