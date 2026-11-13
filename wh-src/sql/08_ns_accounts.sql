-- ผังบัญชีร้านก๋วยเตี๋ยว (NS) แบบพื้นฐาน — บอสหนึ่งตกลง 13 พ.ย. 2569 17:31 · ตอบ 17:43: จด VAT · บัญชีธนาคารของร้านเอง
-- เพื่อให้ของจากคลังกลางที่ลง "สำหรับร้านก๋วยเตี๋ยว" / ร้านก๋วยเตี๋ยวเบิก ลงบัญชีได้ตั้งแต่ 1 ธ.ค.
-- จด VAT → แยกภาษีซื้อ 1150-NS แบบ FT/ซัน/เกด (ไม่รวมในต้นทุนแบบร้านลาบ)
-- ยังไม่ทำ: หน้าขายรายวัน · ยอดร้านลาบค้างร้านก๋วยเตี๋ยว (2100-LS 701,682)

insert into public.accounts(code, entity, name, account_type, normal_balance, cost_group, is_active) values
  ('1010-NS','NS','เงินสดในร้าน - ร้านก๋วยเตี๋ยว','asset','debit',null,true),
  ('1020-NS','NS','เงินฝากธนาคาร - ร้านก๋วยเตี๋ยว','asset','debit',null,true),
  ('1150-NS','NS','ภาษีซื้อ (VAT ซื้อ) - ร้านก๋วยเตี๋ยว','asset','debit',null,true),
  ('2200-NS','NS','ภาษีขาย (VAT ขาย) - ร้านก๋วยเตี๋ยว','liability','credit',null,true),
  ('3010-NS','NS','ทุนเจ้าของ - ร้านก๋วยเตี๋ยว','equity','credit',null,true),
  ('3030-NS','NS','กำไรสะสม - ร้านก๋วยเตี๋ยว','equity','credit',null,true),
  ('4010-NS','NS','รายได้ขาย-เงินสด - ร้านก๋วยเตี๋ยว','revenue','credit',null,true),
  ('4020-NS','NS','รายได้ขาย-เงินโอน - ร้านก๋วยเตี๋ยว','revenue','credit',null,true),
  ('4030-NS','NS','รายได้ขาย-Grab - ร้านก๋วยเตี๋ยว','revenue','credit',null,true),
  ('5010-NS','NS','ต้นทุนเนื้อ (วัว/หมู) - ร้านก๋วยเตี๋ยว','expense','debit','food',true),
  ('5020-NS','NS','ต้นทุนผัก - ร้านก๋วยเตี๋ยว','expense','debit','food',true),
  ('5030-NS','NS','ต้นทุนเครื่องปรุง/ขนม - ร้านก๋วยเตี๋ยว','expense','debit','food',true),
  ('5040-NS','NS','ต้นทุนเครื่องดื่ม/น้ำแข็ง - ร้านก๋วยเตี๋ยว','expense','debit','food',true),
  ('5050-NS','NS','ต้นทุนเส้น/ข้าว/แป้ง - ร้านก๋วยเตี๋ยว','expense','debit','food',true),
  ('5060-NS','NS','ต้นทุนเหล้า/เบียร์ - ร้านก๋วยเตี๋ยว','expense','debit','food',true),
  ('6010-NS','NS','ค่าแรงคนงาน - ร้านก๋วยเตี๋ยว','expense','debit','labor',true),
  ('6110-NS','NS','ค่าเช่าร้าน - ร้านก๋วยเตี๋ยว','expense','debit','occupancy',true),
  ('6140-NS','NS','ค่าแก๊ส/น้ำมัน/ขนส่ง/ถ่าน - ร้านก๋วยเตี๋ยว','expense','debit','waste_misc',true),
  ('6210-NS','NS','ค่าบรรจุภัณฑ์ - ร้านก๋วยเตี๋ยว','expense','debit','waste_misc',true),
  ('6250-NS','NS','ค่าของใช้สิ้นเปลือง - ร้านก๋วยเตี๋ยว','expense','debit','waste_misc',true),
  ('6410-NS','NS','ค่าอุปกรณ์/ซ่อมแซม - ร้านก๋วยเตี๋ยว','expense','debit','waste_misc',true),
  ('6900-NS','NS','ค่าใช้จ่ายเบ็ดเตล็ด - ร้านก๋วยเตี๋ยว','expense','debit','waste_misc',true)
on conflict (code) do nothing;

insert into public.inv_entity_accounts(entity, cash_account, bank_account, equity_account, vat_input_account, misc_account)
values ('NS','1010-NS','1020-NS','3010-NS','1150-NS','6900-NS')
on conflict (entity) do nothing;

insert into public.inv_category_accounts(category, entity, account_code) values
  ('ค่าเนื้อ','NS','5010-NS'),
  ('ค่าผัก','NS','5020-NS'),
  ('ค่าเครื่องดื่ม น้ำแข็ง','NS','5040-NS'),
  ('ค่าเหล้า เบียร์','NS','5060-NS'),
  ('ค่าแคปหมู ถั่ว ขนม ของหวาน','NS','5030-NS'),
  ('ค่าเส้น ข้าวสาร ข้าวเหนียว','NS','5050-NS'),
  ('ค่าแป้ง กันบูด','NS','5050-NS'),
  ('ค่าบรรจุภัณฑ์ ช้อนพลาสติก ตะเกียบ ยาง ไม้เสียบลูกชิ้น','NS','6210-NS'),
  ('ค่าเครื่องปรุง','NS','5030-NS'),
  ('แก็ส น้ำมันรถ ค่าขนส่ง ถ่าน','NS','6140-NS'),
  ('ของใช้สิ้นเปลือง ทิชชู่ น้ำยาล้างจาน กระดาษความร้อน ฝอยขัดหม้อ','NS','6250-NS'),
  ('อุปกรณ์ ตะแกรง ไม้กวาด','NS','6410-NS')
on conflict (category, entity) do update set account_code = excluded.account_code;
