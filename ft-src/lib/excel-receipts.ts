// Only imported Excel sales without a receipt date are corrected.
export const missingExcelReceipts="SELECT id FROM records WHERE kind='sale' AND id IN (SELECT value FROM json_each(?)) AND COALESCE(json_extract(payload,'$.receiptDate'),'')='' LIMIT 1";
export const correctExcelReceipts="UPDATE records SET payload=json_set(payload,'$.receiptDate',json_extract(payload,'$.date')) WHERE kind='sale' AND id IN (SELECT value FROM json_each(?)) AND COALESCE(json_extract(payload,'$.receiptDate'),'')=''";
