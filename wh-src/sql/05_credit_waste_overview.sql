-- คลังกลาง ขั้นเพิ่ม (12 พ.ย. 2569) — ยืมจุดเด่นจาก daothiam-central
-- 1) ซื้อเชื่อ / จ่ายบางส่วน: inv_purchases.paid_from = 'credit' + ตารางจ่ายหนี้ inv_purchase_payments
--    บัญชี: ตอนซื้อเชื่อ = เหมือนกองกลางจ่าย (ของร้าน → Dr ต้นทุน / Cr ทุน 3010 · ของคลังกลาง → ไม่ลง)
--           ตอนจ่ายหนี้จากลิ้นชัก/บัญชีร้าน → ใบ wh_pay ของร้านที่จ่าย Dr 3010 / Cr เงินสด-ธนาคาร (กองกลางจ่าย = ไม่ลง)
--    ยอดค้างติดตามที่ตารางนี้ (ไม่ใช้บัญชีเจ้าหนี้ เพราะเงินทุกกิจการรวมเป็นกองเดียว)
-- 2) ของเสียจากคลังกลาง: inv_moves.kind = 'waste' (from_loc = 'main', to_loc = null) — ลดสต๊อก ไม่ลงบัญชีร้าน
-- 3) wh_overview(from, to): สรุปจากสมุดบัญชีต่อกิจการ (รวมที่ฐานข้อมูล ได้ไม่กี่แถว ไม่ติดเพดาน 1,000)
--    ไม่แสดงเงินสดสะสม: สมุดบัญชีไม่มียอดตั้งต้น/เงินที่เจ้าของเก็บออก ยอดสะสมจึงใช้ไม่ได้ (ทดสอบ: LS −1.27 ล้าน, FT +1.31 ล้าน)

-- ── 1) ซื้อเชื่อ ──
alter table public.inv_purchases drop constraint if exists inv_purchases_paid_from_check;
alter table public.inv_purchases add constraint inv_purchases_paid_from_check
  check (paid_from = any (array['pool','drawer','transfer','credit']));
alter table public.inv_purchases drop constraint if exists inv_purchases_check;
alter table public.inv_purchases add constraint inv_purchases_check
  check ((paid_from in ('pool','credit') and paid_entity is null) or (paid_from in ('drawer','transfer') and paid_entity is not null));

create table if not exists public.inv_purchase_payments (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.inv_purchases(id) on delete restrict,
  pay_date date not null,
  amount numeric not null check (amount > 0),
  paid_from text not null check (paid_from in ('pool','drawer','transfer')),
  paid_entity text check (paid_entity in ('LS','NS','FT','GBS','GBK')),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz,
  check ((paid_from = 'pool' and paid_entity is null) or (paid_from <> 'pool' and paid_entity is not null))
);
create index if not exists inv_purchase_payments_purchase on public.inv_purchase_payments(purchase_id);
create index if not exists inv_purchase_payments_date on public.inv_purchase_payments(pay_date);
alter table public.inv_purchase_payments enable row level security;
drop policy if exists "authenticated full access" on public.inv_purchase_payments;
create policy "authenticated full access" on public.inv_purchase_payments for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.inv_purchase_payments to authenticated;

drop trigger if exists inv_purchase_payments_log on public.inv_purchase_payments;
create trigger inv_purchase_payments_log before delete or update on public.inv_purchase_payments
  for each row execute function public.inv_log_edit();

/* ก่อนบันทึกการจ่าย: ใบซื้อต้องเป็นซื้อเชื่อ · จ่ายรวมไม่เกินยอดซื้อ */
create or replace function public.wh_payment_check() returns trigger language plpgsql set search_path = public as $$
declare p record; s numeric;
begin
  select * into p from inv_purchases where id = new.purchase_id;
  if p.paid_from <> 'credit' then raise exception 'จ่ายหนี้ได้เฉพาะรายการที่ซื้อเชื่อ'; end if;
  select coalesce(sum(amount),0) into s from inv_purchase_payments where purchase_id = new.purchase_id and id <> new.id;
  if s + new.amount > p.amount + 0.001 then
    raise exception 'จ่ายเกินยอดค้าง: ยอดซื้อ % จ่ายไปแล้ว % เหลือ %', p.amount, s, p.amount - s;
  end if;
  return new;
end $$;
drop trigger if exists inv_purchase_payments_check on public.inv_purchase_payments;
create trigger inv_purchase_payments_check before insert or update on public.inv_purchase_payments
  for each row execute function public.wh_payment_check();

/* แก้/ลบใบซื้อเชื่อที่มีการจ่ายแล้ว: ห้ามเปลี่ยนเป็นจ่ายแบบอื่น · ห้ามลดยอดต่ำกว่าที่จ่าย · ห้ามลบ */
create or replace function public.wh_purchase_paid_guard() returns trigger language plpgsql set search_path = public as $$
declare s numeric;
begin
  select coalesce(sum(amount),0) into s from inv_purchase_payments where purchase_id = old.id;
  if s = 0 then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  if tg_op = 'DELETE' then raise exception 'ลบไม่ได้: รายการนี้จ่ายหนี้ไปแล้ว % บาท — ลบการจ่ายก่อน', s; end if;
  if new.paid_from <> 'credit' then raise exception 'เปลี่ยนวิธีจ่ายไม่ได้: จ่ายหนี้ไปแล้ว % บาท — ลบการจ่ายก่อน', s; end if;
  if new.amount + 0.001 < s then raise exception 'ยอดซื้อต่ำกว่าที่จ่ายไปแล้ว (% บาท)', s; end if;
  return new;
end $$;
drop trigger if exists inv_purchases_paid_guard on public.inv_purchases;
create trigger inv_purchases_paid_guard before update or delete on public.inv_purchases
  for each row execute function public.wh_purchase_paid_guard();

/* ลงบัญชีการจ่ายหนี้ 1 แถว (ลบของเดิมแล้วลงใหม่) — ลิ้นชัก/บัญชีร้านจ่าย = เงินออกจากร้านนั้น */
create or replace function public.wh_post_payment(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare y record; p record; it record; pa record;
begin
  delete from journal_entries where source_id = p_id and source_type = 'wh_pay';
  select * into y from inv_purchase_payments where id = p_id;
  if not found or y.paid_from = 'pool' then return; end if;
  select * into pa from inv_entity_accounts where entity = y.paid_entity;
  if pa.entity is null then return; end if;                       -- ร้านก๋วยเตี๋ยว (ยังไม่มีผังบัญชี) = ไม่ลง
  select * into p from inv_purchases where id = y.purchase_id;
  select * into it from inv_items where id = p.item_id;
  perform wh_je(pa.entity, y.pay_date, 'WR-' || to_char(y.pay_date,'YYMMDD') || '-' || upper(left(replace(p_id::text,'-',''),8)),
    'จ่ายหนี้ค่าของ: ' || it.name || coalesce(' (' || nullif(p.vendor_name,'') || ')','') || ' ซื้อ ' || to_char(p.purchase_date,'DD/MM'),
    'wh_pay', p_id, jsonb_build_array(
      jsonb_build_object('a',pa.equity_account,'dr',y.amount,'cr',0,'m',null),
      jsonb_build_object('a',case when y.paid_from = 'transfer' then coalesce(pa.bank_account, pa.cash_account) else pa.cash_account end,
                         'dr',0,'cr',y.amount,'m',null)));
end $$;
create or replace function public.wh_payment_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then perform wh_post_payment(old.id); else perform wh_post_payment(new.id); end if;
  return null;
end $$;
drop trigger if exists inv_purchase_payments_post on public.inv_purchase_payments;
create trigger inv_purchase_payments_post after insert or update or delete on public.inv_purchase_payments
  for each row execute function public.wh_payment_after();
revoke execute on function public.wh_post_payment(uuid), public.wh_payment_after() from public, anon, authenticated;

-- ── 2) ของเสีย ──
alter table public.inv_moves drop constraint if exists inv_moves_kind_check;
alter table public.inv_moves add constraint inv_moves_kind_check
  check (kind = any (array['purchase','draw','transfer','return','produce','adjust','use','waste']));

-- ── 3) ภาพรวมจากสมุดบัญชี ──
create or replace function public.wh_overview(p_from date, p_to date)
returns table(entity text, sales numeric, vat_out numeric, cost numeric, expense numeric, line_count bigint)
language sql stable security invoker set search_path = public as $$
  select e.entity,
    round(coalesce(sum(l.credit - l.debit) filter (where l.account_code like '4%'),0),2),
    round(coalesce(sum(l.credit - l.debit) filter (where l.account_code like '2200%'),0),2),
    round(coalesce(sum(l.debit - l.credit) filter (where l.account_code like '5%'),0),2),
    round(coalesce(sum(l.debit - l.credit) filter (where l.account_code like '6%'),0),2),
    count(*)
  from journal_entries e join journal_lines l on l.entry_id = e.id
  where e.entry_date between p_from and p_to
  group by e.entity order by e.entity
$$;
grant execute on function public.wh_overview(date, date) to authenticated;
