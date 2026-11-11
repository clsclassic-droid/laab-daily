-- 12 พ.ย. 2569 migration wh_ls_vat_in_cost — ร้านลาบ (LS) เก็บ VAT ซื้อรวมในต้นทุนเหมือนหน้าร้านลาบเดิม แล้วหักคืนในการคำนวณ VAT
update public.inv_entity_accounts set vat_input_account = null where entity = 'LS';

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
    net := p.amount - case when ea.vat_input_account is null then 0 else p.vat_amount end;  -- ร้านที่ไม่มีบัญชี VAT ซื้อ (LS) = VAT รวมในต้นทุน
    acc := wh_cost_acc(p.item_id, e);
    -- จ่ายจากเงินของร้านนั้นเอง = เงินสด/ธนาคารร้าน · กองกลางหรือร้านอื่นจ่าย = ทุนเจ้าของ (ไม่ตามหนี้คืน)
    cr_acc := case when p.paid_from <> 'pool' and p.paid_entity = e
                   then case when p.paid_from = 'transfer' then coalesce(ea.bank_account, ea.equity_account) else ea.cash_account end
                   else ea.equity_account end;
    perform wh_je(e, p.purchase_date, 'WP-' || no6, dsc, 'wh_purchase', p_id, jsonb_build_array(
      jsonb_build_object('a',acc,'dr',net,'cr',0,'m',it.name),
      jsonb_build_object('a',ea.vat_input_account,'dr',case when ea.vat_input_account is null then 0 else p.vat_amount end,'cr',0,'m','VAT ซื้อ'),
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
  if ea.vat_input_account is null then cost := cost + vat; vat := 0; end if;  -- LS: VAT รวมในต้นทุน
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

/* VAT ซื้อจากหน้าซื้อของ/คลังกลาง ของกิจการ ในช่วงวันที่ (ซื้อให้ร้านโดยตรง + ส่วนแบ่ง VAT ตามที่เบิก − คืน) */
create or replace function public.wh_vat_in(p_ent text, p_from date, p_to date) returns numeric
language sql stable set search_path = public as $$
  select round(coalesce((select sum(p.vat_amount) from inv_purchases p join inv_locations l on l.code = p.for_loc
                          where l.entity = p_ent and p.purchase_date between p_from and p_to), 0)
             + coalesce((select sum(case when m.from_loc = 'main' then 1 else -1 end * m.qty * coalesce(m.unit_vat,0))
                          from inv_moves m join inv_locations l on l.code = case when m.from_loc = 'main' then m.to_loc else m.from_loc end
                          where l.entity = p_ent and m.move_date between p_from and p_to
                            and (m.from_loc = 'main' or m.to_loc = 'main') and m.from_loc is not null and m.to_loc is not null), 0), 2)
$$;
grant execute on function public.wh_vat_in(text,date,date) to authenticated;

revoke execute on function public.wh_post_purchase(uuid), public.wh_post_move(uuid) from public, anon, authenticated;
