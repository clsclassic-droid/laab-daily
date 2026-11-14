-- wh_09_quick_buy (14 พ.ย. 2569): เมนูซื้อของแบบร้านลาบ
-- 1) ค่าปกติของแต่ละรายการ: คชจ.ของ (for_loc) · ใช้เงินอะไรจ่าย (paid_from/paid_entity) · VAT
alter table inv_items add column if not exists def_for_loc text not null default 'main';
alter table inv_items add column if not exists def_paid_from text not null default 'pool';
alter table inv_items add column if not exists def_paid_entity text;
alter table inv_items add column if not exists def_tax_invoice boolean not null default false;
alter table inv_items add constraint inv_items_def_paid_from_check check (def_paid_from in ('pool','drawer','transfer','credit'));
alter table inv_items add constraint inv_items_def_paid_entity_check check (def_paid_entity is null or def_paid_entity in ('LS','NS','FT','GBS','GBK'));
-- 2) ราคาครั้งก่อนของทุกรายการ (ก่อนวันที่เลือก) — 1 แถวต่อสินค้า
create or replace function inv_last_prices(p_date date)
returns table(item_id uuid, purchase_date date, unit_price numeric, qty numeric)
language sql stable security invoker set search_path = public as $$
  select distinct on (p.item_id) p.item_id, p.purchase_date, p.unit_price, p.qty
  from inv_purchases p where p.purchase_date < p_date
  order by p.item_id, p.purchase_date desc, p.created_at desc
$$;
grant execute on function inv_last_prices(date) to authenticated;
