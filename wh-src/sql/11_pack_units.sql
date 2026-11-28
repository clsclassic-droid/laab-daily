-- 28 พ.ย. 2569 บอสหนึ่ง "แก้เลย": หน่วยซื้อ (แพ็ค/ลัง/หิ้ว) แปลงเป็นหน่วยเล็ก (unit) ที่ใช้ในคลังและตอนเบิก
-- inv_purchases.qty / unit_price เก็บเป็นหน่วยเล็กเสมอ (บัญชีไม่เปลี่ยน) · หน้าซื้อของแปลงให้ตอนกรอก
alter table public.inv_items
  add column if not exists buy_unit text,
  add column if not exists pack_qty numeric check (pack_qty is null or pack_qty > 0);
comment on column public.inv_items.buy_unit is 'หน่วยตอนซื้อ เช่น ลัง แพ็ค หิ้ว (ว่าง = ซื้อเป็นหน่วยเล็ก)';
comment on column public.inv_items.pack_qty is 'จำนวนหน่วยเล็ก (unit) ต่อ 1 หน่วยซื้อ เช่น 12';
