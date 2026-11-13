-- ns_01: ร้านก๋วยเตี๋ยว (NS) ใช้หน้าร้านลาบเป็นแม่แบบ + ช่อง "เอาเงินสดออก" (ใช้ทั้ง LS และ NS)
-- 1) บัญชี NS ที่หน้าร้านลาบใช้ แต่ NS ยังไม่มี (ชื่อ/ประเภท/กลุ่มต้นทุน ตาม LS)
insert into accounts (code, entity, name, account_type, normal_balance, is_active, cost_group)
select replace(a.code,'-LS','-NS'), 'NS', replace(a.name,'ร้านลาบ','ร้านก๋วยเตี๋ยว'), a.account_type, a.normal_balance, true, a.cost_group
from accounts a
where a.entity='LS' and a.code in ('1030-LS','1031-LS','1032-LS','2010-LS','2020-LS','2030-LS','4040-LS','4900-LS','5070-LS',
  '6020-LS','6030-LS','6115-LS','6120-LS','6130-LS','6220-LS','6230-LS','6240-LS','6310-LS','6320-LS','6330-LS','6340-LS','6420-LS','6510-LS')
on conflict (code) do nothing;

insert into accounts (code, entity, name, account_type, normal_balance, is_active, cost_group) values
 ('3020-NS','NS','ส่งเงินเข้ากองกลาง/ถอนใช้ส่วนตัว - ร้านก๋วยเตี๋ยว','equity','debit',true,null),
 ('5080-NS','NS','ต้นทุนลูกชิ้น (ซื้อจากเกดขาย Grab) - ร้านก๋วยเตี๋ยว','expense','debit',true,'food'),
 ('6800-NS','NS','เงินสดขาด/เกิน - ร้านก๋วยเตี๋ยว','expense','debit',true,'waste_misc')
on conflict (code) do nothing;

-- 2) ปิดร้าน: เอาเงินสดออก (เข้ากองกลาง / ฝากบัญชีร้าน)
alter table cash_counts add column if not exists cash_out numeric not null default 0;
alter table cash_counts add column if not exists cash_out_to text;
alter table cash_counts add constraint cash_counts_cash_out_to_check check (cash_out_to is null or cash_out_to in ('pool','bank'));

-- 3) ใบบัญชีเอาเงินสดออก
alter table journal_entries drop constraint journal_entries_source_type_check;
alter table journal_entries add constraint journal_entries_source_type_check check (source_type = any (array[
 'sales','purchase_cash','purchase_transfer','purchase_credit','received_from_ns','cash_adjustment','other','staff_advance','payroll',
 'monthly_expense','ap_payment','wh_purchase','wh_pay','wh_draw','gb_sales','gb_expense','gb_goods','gb_variable','gb_cash_diff','cash_out']));

-- 4) ค่าคอม Grab ร้านก๋วยเตี๋ยว (ตั้งเริ่มต้นเท่าร้านลาบ แก้ได้ในหน้า)
insert into settings (entity, grab_commission_pct)
select 'NS', grab_commission_pct from settings where entity='LS'
on conflict (entity) do nothing;
