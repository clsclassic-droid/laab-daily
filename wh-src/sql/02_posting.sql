-- คลังกลาง ขั้น 2: ลงบัญชีอัตโนมัติจากหน้าซื้อของ + การเบิก/คืนคลังกลาง
-- ใบบัญชีผูกกับแถวต้นทางด้วย journal_entries.source_id (แก้/ลบแถว = ลงใหม่/ลบใบตาม)

alter table public.journal_entries add column if not exists source_id uuid;
create index if not exists journal_entries_source_id_idx on public.journal_entries(source_id) where source_id is not null;

alter table public.journal_entries drop constraint journal_entries_source_type_check;
alter table public.journal_entries add constraint journal_entries_source_type_check check (source_type = any (array[
  'sales','purchase_cash','purchase_transfer','purchase_credit','received_from_ns','cash_adjustment','other',
  'staff_advance','payroll','monthly_expense','ap_payment','wh_purchase','wh_pay','wh_draw']));

-- VAT ซื้อต่อหน่วยของการเบิก (แบ่ง VAT ตามที่เบิก)
alter table public.inv_moves add column if not exists unit_vat numeric;

/* สต๊อกคลังกลาง (ไม่นับแถวย้าย p_skip) → qty, มูลค่าไม่รวม VAT, VAT */
create or replace function public.wh_main_bal(p_item uuid, p_skip uuid default null)
returns table(qty numeric, val numeric, vat numeric) language sql stable set search_path = public as $$
  with ev as (
    select p.qty q, p.amount - p.vat_amount v, p.vat_amount t from inv_purchases p where p.for_loc = 'main' and p.item_id = p_item
    union all select m.qty, m.qty*coalesce(m.unit_cost,0), m.qty*coalesce(m.unit_vat,0) from inv_moves m
      where m.to_loc = 'main' and m.item_id = p_item and m.id is distinct from p_skip
    union all select -m.qty, -m.qty*coalesce(m.unit_cost,0), -m.qty*coalesce(m.unit_vat,0) from inv_moves m
      where m.from_loc = 'main' and m.item_id = p_item and m.id is distinct from p_skip)
  select coalesce(sum(q),0), coalesce(sum(v),0), coalesce(sum(t),0) from ev
$$;

/* ก่อนบันทึกการเบิก/คืนคลังกลาง: ต้นทุนต่อหน่วย = ราคาเฉลี่ยตอนนั้น (แก้ = คิดใหม่) · ของไม่พอ = ไม่ให้บันทึก */
create or replace function public.wh_move_cost() returns trigger language plpgsql set search_path = public as $$
declare b record; nm text;
begin
  if coalesce(new.from_loc,'') <> 'main' and coalesce(new.to_loc,'') <> 'main' then return new; end if;
  if new.from_loc is null then  -- ของเข้าคลังกลางที่ไม่ได้ซื้อ (เช่น ผลิตเอง) ใช้ต้นทุนที่ใส่มา
    new.unit_cost := coalesce(new.unit_cost,0); new.unit_vat := coalesce(new.unit_vat,0); return new;
  end if;
  select * into b from wh_main_bal(new.item_id, new.id);
  if new.from_loc = 'main' then
    if b.qty < new.qty then
      select name into nm from inv_items where id = new.item_id;
      raise exception 'ของในคลังกลางไม่พอ: % เหลือ % แต่จะเบิก %', nm, round(b.qty,3), new.qty;
    end if;
  end if;
  -- คืนเข้าคลัง ใช้ราคาเฉลี่ยปัจจุบัน (ถ้าไม่มีของเหลือ ใช้ราคาเดิมของแถว)
  if b.qty > 0 then
    new.unit_cost := round(b.val / b.qty, 4); new.unit_vat := round(b.vat / b.qty, 4);
  else
    new.unit_cost := coalesce(new.unit_cost,0); new.unit_vat := coalesce(new.unit_vat,0);
  end if;
  return new;
end $$;

drop trigger if exists inv_moves_a_wh_cost on public.inv_moves;
create trigger inv_moves_a_wh_cost before insert or update on public.inv_moves
  for each row execute function public.wh_move_cost();

/* เขียนใบบัญชี 1 ใบ (lines = [{a,dr,cr,m}]) */
create or replace function public.wh_je(p_ent text, p_date date, p_no text, p_desc text, p_type text, p_src uuid, p_lines jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid; d numeric;
begin
  select sum((l->>'dr')::numeric - (l->>'cr')::numeric) into d from jsonb_array_elements(p_lines) l;
  if round(coalesce(d,0),2) <> 0 then raise exception 'ใบบัญชี % เดบิตไม่เท่าเครดิต (%)', p_no, d; end if;
  insert into journal_entries(entity, entry_date, voucher_no, description, source_type, source_id, created_by)
    values (p_ent, p_date, p_no, p_desc, p_type, p_src,
            (select id from profiles where id = auth.uid())) returning id into v_id;
  insert into journal_lines(entry_id, account_code, debit, credit, memo)
    select v_id, l->>'a', round((l->>'dr')::numeric,2), round((l->>'cr')::numeric,2), l->>'m'
    from jsonb_array_elements(p_lines) l where round((l->>'dr')::numeric,2) <> 0 or round((l->>'cr')::numeric,2) <> 0;
end $$;

/* บัญชีต้นทุนของสินค้า × กิจการ (ไม่มีคู่ = เบ็ดเตล็ด) */
create or replace function public.wh_cost_acc(p_item uuid, p_ent text) returns text language sql stable set search_path = public as $$
  select coalesce((select ca.account_code from inv_category_accounts ca join inv_items i on i.category = ca.category
                   where i.id = p_item and ca.entity = p_ent),
                  (select misc_account from inv_entity_accounts where entity = p_ent))
$$;

/* ลงบัญชีรายการซื้อ 1 แถว (ลบของเดิมแล้วลงใหม่) */
create or replace function public.wh_post_purchase(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare p record; it record; e text; ea record; pa record; net numeric; acc text; cr_acc text; no6 text; dsc text;
begin
  delete from journal_entries where source_id = p_id and source_type in ('wh_purchase','wh_pay');
  select * into p from inv_purchases where id = p_id;
  if not found or p.amount = 0 then return; end if;
  select * into it from inv_items where id = p.item_id;
  select entity into e from inv_locations where code = p.for_loc;      -- คลังกลาง = null (ยังไม่เป็นของกิจการไหน)
  select * into ea from inv_entity_accounts where entity = e;            -- ไม่มีผังบัญชี (NS) = ไม่ลง
  select * into pa from inv_entity_accounts where entity = p.paid_entity;
  no6 := to_char(p.purchase_date,'YYMMDD') || '-' || upper(left(replace(p_id::text,'-',''),8));
  dsc := 'ซื้อ ' || it.name || ' ' || trim_scale(p.qty)::text || ' ' || coalesce(it.unit,'') || coalesce(' (' || nullif(p.vendor_name,'') || ')','');
  if ea.entity is not null then
    net := p.amount - p.vat_amount;
    acc := wh_cost_acc(p.item_id, e);
    -- จ่ายจากเงินของร้านนั้นเอง = เงินสด/ธนาคารร้าน · กองกลางหรือร้านอื่นจ่าย = ทุนเจ้าของ (ไม่ตามหนี้คืน)
    cr_acc := case when p.paid_from <> 'pool' and p.paid_entity = e
                   then case when p.paid_from = 'transfer' then coalesce(ea.bank_account, ea.equity_account) else ea.cash_account end
                   else ea.equity_account end;
    perform wh_je(e, p.purchase_date, 'WP-' || no6, dsc, 'wh_purchase', p_id, jsonb_build_array(
      jsonb_build_object('a',acc,'dr',net,'cr',0,'m',it.name),
      jsonb_build_object('a',ea.vat_input_account,'dr',p.vat_amount,'cr',0,'m','VAT ซื้อ'),
      jsonb_build_object('a',cr_acc,'dr',0,'cr',p.amount,'m',null)));
  end if;
  -- เงินออกจากร้านที่จ่าย แต่ของไม่ใช่ของร้านนั้น (ของคลังกลาง/ร้านอื่น) = ถอนทุนจากร้านที่จ่าย
  if p.paid_from <> 'pool' and pa.entity is not null and pa.entity is distinct from ea.entity then
    perform wh_je(pa.entity, p.purchase_date, 'WQ-' || no6, 'จ่ายแทน: ' || dsc, 'wh_pay', p_id, jsonb_build_array(
      jsonb_build_object('a',pa.equity_account,'dr',p.amount,'cr',0,'m',null),
      jsonb_build_object('a',case when p.paid_from = 'transfer' then coalesce(pa.bank_account, pa.cash_account) else pa.cash_account end,
                         'dr',0,'cr',p.amount,'m',null)));
  end if;
end $$;

/* ลงบัญชีการเบิกจากคลังกลาง / คืนเข้าคลังกลาง 1 แถว */
create or replace function public.wh_post_move(p_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare m record; it record; ea record; loc text; sgn int; cost numeric; vat numeric; acc text; dsc text;
begin
  delete from journal_entries where source_id = p_id and source_type = 'wh_draw';
  select * into m from inv_moves where id = p_id;
  if not found then return; end if;
  if m.from_loc = 'main' and m.to_loc is not null then loc := m.to_loc; sgn := 1;
  elsif m.to_loc = 'main' and m.from_loc is not null then loc := m.from_loc; sgn := -1;
  else return; end if;
  select a.* into ea from inv_locations l join inv_entity_accounts a on a.entity = l.entity where l.code = loc;
  if ea.entity is null then return; end if;
  select * into it from inv_items where id = m.item_id;
  cost := round(m.qty * coalesce(m.unit_cost,0), 2); vat := round(m.qty * coalesce(m.unit_vat,0), 2);
  if cost + vat = 0 then return; end if;
  acc := wh_cost_acc(m.item_id, ea.entity);
  dsc := case when sgn = 1 then 'เบิกจากคลังกลาง ' else 'คืนคลังกลาง ' end || it.name || ' ' ||
         trim_scale(m.qty)::text || ' ' || coalesce(it.unit,'');
  perform wh_je(ea.entity, m.move_date, 'WD-' || to_char(m.move_date,'YYMMDD') || '-' || upper(left(replace(p_id::text,'-',''),8)),
    dsc, 'wh_draw', p_id, case when sgn = 1 then jsonb_build_array(
      jsonb_build_object('a',acc,'dr',cost,'cr',0,'m',it.name),
      jsonb_build_object('a',ea.vat_input_account,'dr',vat,'cr',0,'m','VAT ซื้อ (ตามที่เบิก)'),
      jsonb_build_object('a',ea.equity_account,'dr',0,'cr',cost+vat,'m',null))
    else jsonb_build_array(
      jsonb_build_object('a',ea.equity_account,'dr',cost+vat,'cr',0,'m',null),
      jsonb_build_object('a',acc,'dr',0,'cr',cost,'m',it.name),
      jsonb_build_object('a',ea.vat_input_account,'dr',0,'cr',vat,'m','VAT ซื้อ (คืนคลัง)')) end);
end $$;

/* หลังเปลี่ยนแถว: ลงบัญชีใหม่ + เช็คสต๊อกคลังกลางไม่ติดลบ */
create or replace function public.wh_after_change() returns trigger language plpgsql security definer set search_path = public as $$
declare r record; ids uuid[]; i uuid; q numeric; nm text; main_hit boolean;
begin
  if tg_table_name = 'inv_purchases' then
    if tg_op = 'DELETE' then perform wh_post_purchase(old.id); else perform wh_post_purchase(new.id); end if;
    main_hit := (tg_op <> 'INSERT' and old.for_loc = 'main') or (tg_op <> 'DELETE' and new.for_loc = 'main');
  else
    main_hit := (tg_op <> 'INSERT' and 'main' in (coalesce(old.from_loc,''), coalesce(old.to_loc,'')))
             or (tg_op <> 'DELETE' and 'main' in (coalesce(new.from_loc,''), coalesce(new.to_loc,'')));
    if not main_hit then return null; end if;
    if tg_op = 'DELETE' then perform wh_post_move(old.id); else perform wh_post_move(new.id); end if;
  end if;
  if main_hit then
    ids := array_remove(array[case when tg_op <> 'INSERT' then old.item_id end, case when tg_op <> 'DELETE' then new.item_id end], null);
    foreach i in array ids loop
      select b.qty into q from wh_main_bal(i) b;
      if q < 0 then
        select name into nm from inv_items where id = i;
        raise exception 'ทำไม่ได้: คลังกลาง % จะติดลบ (%) เพราะเบิกไปแล้ว — แก้/ลบการเบิกก่อน', nm, round(q,3);
      end if;
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists inv_purchases_wh_post on public.inv_purchases;
create trigger inv_purchases_wh_post after insert or update or delete on public.inv_purchases
  for each row execute function public.wh_after_change();
drop trigger if exists inv_moves_wh_post on public.inv_moves;
create trigger inv_moves_wh_post after insert or update or delete on public.inv_moves
  for each row execute function public.wh_after_change();

revoke execute on function public.wh_je(text,date,text,text,text,uuid,jsonb), public.wh_post_purchase(uuid),
  public.wh_post_move(uuid), public.wh_after_change() from public, anon, authenticated;
