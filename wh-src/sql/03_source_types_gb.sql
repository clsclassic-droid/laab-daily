-- 12 พ.ย. 2569 migration journal_source_types_gb — เพิ่มประเภทใบบัญชีของหน้าลูกชิ้นปิ้ง (เดิมถูก check constraint ปฏิเสธ)
alter table public.journal_entries drop constraint journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type = any (array[
  'sales','purchase_cash','purchase_transfer','purchase_credit','received_from_ns','cash_adjustment','other',
  'staff_advance','payroll','monthly_expense','ap_payment','wh_purchase','wh_pay','wh_draw',
  'gb_sales','gb_expense','gb_goods','gb_variable','gb_cash_diff']));
