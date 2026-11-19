-- wh_10_cat_groups (19 พ.ย. 2569): บอสหนึ่งเพิ่ม/แก้/เปลี่ยนชื่อ/ย้าย หัวข้อและหมวด ได้เอง
-- 1) หัวข้อ (เดิมเขียนตายตัวในโค้ด GROUPS)
create table if not exists inv_cat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  note text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table inv_cat_groups enable row level security;
create policy "authenticated full access" on inv_cat_groups for all to authenticated using (true) with check (true);
alter table inv_categories add column if not exists group_id uuid references inv_cat_groups(id);

insert into inv_cat_groups (name, note, sort_order) values
 ('วัตถุดิบอาหาร — ซื้อทุกวัน', 'เนื้อ ผัก เส้น ข้าว แป้ง เครื่องปรุง ขนม', 10),
 ('เครื่องดื่ม น้ำแข็ง', 'เครื่องดื่ม น้ำแข็ง เหล้า เบียร์', 20),
 ('บรรจุภัณฑ์ ของใช้ แก๊ส', 'ซื้อเป็นครั้ง ไม่ใช่ทุกวัน', 30)
on conflict (name) do nothing;
update inv_categories c set group_id = g.id, sort_order = x.ord
from (values
 ('ค่าเนื้อ','วัตถุดิบอาหาร — ซื้อทุกวัน',10),('ค่าผัก','วัตถุดิบอาหาร — ซื้อทุกวัน',20),('ค่าเส้น ข้าวสาร ข้าวเหนียว','วัตถุดิบอาหาร — ซื้อทุกวัน',30),
 ('ค่าแป้ง กันบูด','วัตถุดิบอาหาร — ซื้อทุกวัน',40),('ค่าเครื่องปรุง','วัตถุดิบอาหาร — ซื้อทุกวัน',50),('ค่าแคปหมู ถั่ว ขนม ของหวาน','วัตถุดิบอาหาร — ซื้อทุกวัน',60),
 ('ค่าเครื่องดื่ม น้ำแข็ง','เครื่องดื่ม น้ำแข็ง',10),('ค่าเหล้า เบียร์','เครื่องดื่ม น้ำแข็ง',20),
 ('ค่าบรรจุภัณฑ์ ช้อนพลาสติก ตะเกียบ ยาง ไม้เสียบลูกชิ้น','บรรจุภัณฑ์ ของใช้ แก๊ส',10),('แก็ส น้ำมันรถ ค่าขนส่ง ถ่าน','บรรจุภัณฑ์ ของใช้ แก๊ส',20),
 ('ของใช้สิ้นเปลือง ทิชชู่ น้ำยาล้างจาน กระดาษความร้อน ฝอยขัดหม้อ','บรรจุภัณฑ์ ของใช้ แก๊ส',30),('อุปกรณ์ ตะแกรง ไม้กวาด','บรรจุภัณฑ์ ของใช้ แก๊ส',40)
) as x(cat, grp, ord) join inv_cat_groups g on g.name = x.grp
where c.name = x.cat;

-- 2) เปลี่ยนชื่อหมวด: หมวด + คู่บัญชี (cascade) + สินค้าในหมวด ในครั้งเดียว
create or replace function inv_rename_category(p_old text, p_new text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if coalesce(trim(p_new),'') = '' then raise exception 'ใส่ชื่อหมวดใหม่'; end if;
  if exists (select 1 from inv_categories where name = trim(p_new)) then raise exception 'มีหมวดชื่อนี้แล้ว'; end if;
  update inv_categories set name = trim(p_new) where name = p_old;
  if not found then raise exception 'ไม่พบหมวด %', p_old; end if;
  update inv_items set category = trim(p_new), updated_at = now() where category = p_old;
end $$;

-- 3) เพิ่มหมวด: ใช้บัญชีเหมือนหมวดเดิม (p_like) หรือสร้างบรรทัดบัญชีใหม่ทุกร้าน (p_acc_name + p_food)
create or replace function inv_add_category(p_name text, p_group uuid, p_like text, p_acc_name text, p_food boolean)
returns text language plpgsql security invoker set search_path = public as $$
declare v_name text := trim(p_name); v_num int; v_ent text; v_code text := null;
begin
  if coalesce(v_name,'') = '' then raise exception 'ใส่ชื่อหมวด'; end if;
  if exists (select 1 from inv_categories where name = v_name) then raise exception 'มีหมวดชื่อนี้แล้ว'; end if;
  insert into inv_categories (name, sort_order, is_active, group_id)
  values (v_name, coalesce((select max(sort_order) from inv_categories where group_id is not distinct from p_group), 0) + 10, true, p_group);
  if coalesce(trim(p_like),'') <> '' then
    insert into inv_category_accounts (category, entity, account_code)
    select v_name, entity, account_code from inv_category_accounts where category = p_like;
  elsif coalesce(trim(p_acc_name),'') <> '' then
    -- เลขบัญชีเดียวกันทุกร้าน: ต้นทุนอาหาร 5200–5990 · ค่าใช้จ่ายอื่น 6600–6790 (เลขที่ยังว่างทุกร้าน)
    select n into v_num from generate_series(case when p_food then 5200 else 6600 end, case when p_food then 5990 else 6790 end, 10) n
     where not exists (select 1 from accounts where code like n::text || '-%') order by n limit 1;
    if v_num is null then raise exception 'เลขบัญชีเต็ม'; end if;
    foreach v_ent in array array['LS','NS','FT','GBS','GBK'] loop
      insert into accounts (code, entity, name, account_type, normal_balance, is_active, cost_group, notes)
      values (v_num || '-' || v_ent, v_ent, trim(p_acc_name), 'expense', 'debit', true, case when p_food then 'food' else 'waste_misc' end, 'สร้างจากหน้าคลังกลาง หมวด ' || v_name);
      insert into inv_category_accounts (category, entity, account_code) values (v_name, v_ent, v_num || '-' || v_ent);
    end loop;
    v_code := v_num::text;
  end if;
  return v_code;
end $$;
grant execute on function inv_rename_category(text, text) to authenticated;
grant execute on function inv_add_category(text, uuid, text, text, boolean) to authenticated;
