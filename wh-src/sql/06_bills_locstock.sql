-- คลังกลาง ขั้นเพิ่ม (12 พ.ย. 2569 ค่ำ) — ยืมจาก daothiam-central ต่อ (บอสเลือก 1.ก 2.ก)
-- 1) บิลยอดเงินก่อน รายละเอียดสินค้าทีหลัง: ตาราง inv_bills + inv_purchases.bill_id
--    แบบ ก: บิลเป็นตัวเตือน ไม่ลงบัญชีเอง — ลงบัญชีตามรายการซื้อที่ใส่ภายหลัง (ระบบเดิม ไม่แตะ trigger ลงบัญชี)
--    บิลครบ = ผลรวม inv_purchases.amount ที่ผูก bill_id เท่ากับ inv_bills.amount (คำนวณตอนแสดงผล)
--    ลบบิล = รายการซื้อที่ผูกไว้ยังอยู่ (bill_id กลายเป็น null)
-- 2) inv_loc_stock(p_date): สต๊อกทุกที่ ณ สิ้นวันที่เลือก จาก inv_moves (+ ซื้อเข้าคลังกลาง)
--    ของที่เบิกจากคลังกลางไปร้าน = ร้านใช้แล้ว ไม่นับเป็นสต๊อกร้าน · ของเสีย/ใช้ = ออกอย่างเดียว

-- ── 1) บิล ──
create table if not exists public.inv_bills (
  id uuid primary key default gen_random_uuid(),
  bill_date date not null,
  vendor_name text,
  amount numeric not null check (amount > 0),
  paid_from text not null check (paid_from in ('pool','drawer','transfer','credit')),
  paid_entity text check (paid_entity in ('LS','NS','FT','GBS','GBK')),
  has_tax_invoice boolean not null default false,
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz,
  check ((paid_from in ('pool','credit') and paid_entity is null) or (paid_from in ('drawer','transfer') and paid_entity is not null))
);
create index if not exists inv_bills_date on public.inv_bills(bill_date);
alter table public.inv_bills enable row level security;
create policy "authenticated full access" on public.inv_bills for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.inv_bills to authenticated;
create trigger inv_bills_log before delete or update on public.inv_bills
  for each row execute function public.inv_log_edit();

alter table public.inv_purchases add column if not exists bill_id uuid references public.inv_bills(id) on delete set null;
create index if not exists inv_purchases_bill on public.inv_purchases(bill_id);

-- ── 2) สต๊อกทุกที่ ณ วันที่ ──
create or replace function public.inv_loc_stock(p_date date)
returns table(item_id uuid, location text, qty numeric)
language sql stable security invoker set search_path = public as $$
  with ev as (
    select p.item_id, 'main'::text as loc, p.qty from inv_purchases p
      where p.for_loc = 'main' and p.purchase_date <= p_date
    union all
    select m.item_id, m.to_loc, m.qty from inv_moves m
      where m.to_loc is not null and m.move_date <= p_date
        and (coalesce(m.from_loc, '') <> 'main' or m.to_loc = 'main')   -- เบิกจากคลังกลางไปร้าน = ใช้แล้ว (ผลิต from_loc เป็น null ต้องนับ — แก้ใน migration wh_06b)
    union all
    select m.item_id, m.from_loc, -m.qty from inv_moves m
      where m.from_loc is not null and m.move_date <= p_date
  )
  select e.item_id, e.loc, round(sum(e.qty), 3)
  from ev e group by e.item_id, e.loc
  having round(sum(e.qty), 3) <> 0
$$;
grant execute on function public.inv_loc_stock(date) to authenticated;
