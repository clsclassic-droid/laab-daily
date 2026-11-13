// หน้า "ลูกชิ้นปิ้ง" (ซัน = GBS, เกด = GBK) — 5 เมนู: ย้ายของ · ขาย · รายจ่าย · สรุป · สินค้า
// ข้อมูลอยู่ใน Supabase: inv_* (สินค้า/ย้ายของ/นับของ) · daily_sales · cash_counts · items+daily_purchases · journal_*
// ดึงข้อมูลทั้งตารางเป็นช่วง ทีละ 1,000 แถว + นับเทียบ (Supabase ตัดเหลือ 1,000 แถวโดยไม่เตือน)
import SiteNav, { initialDate, initialParam } from "../shared/site-nav.jsx";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../supabaseClient.js";

const SHOPS = { GBS: { name: "ซัน", loc: "gbs", bank: false }, GBK: { name: "เกด", loc: "gbk", bank: true } };
const WH_SOURCES = ["wh_purchase", "wh_draw", "wh_pay"];
const WH_LINK = "../wh-test/"; // หน้าซื้อของ/คลังกลาง
const LOC_NAME = { factory: "โรงงาน", gbs: "ซัน", gbk: "เกด", main: "คลังหลัก", ns: "ร้านก๋วยเตี๋ยว", ls: "ร้านลาบ" };
const MOVE_LOCS = ["factory", "gbs", "gbk", "ns"]; // ร้านก๋วยเตี๋ยว = ย้ายไปเก็บไว้เฉยๆ ไม่มีเงิน
// ชื่อลูกค้าที่หน้าโรงลูกชิ้น ↔ ที่ตั้ง (ร้านก๋วยเตี๋ยว = ลูกค้า "ร้านก๋วยเตี๋ยวดาวเทียม")
const LOC_CUST = { gbs: "ซัน", gbk: "เกด", ns: "ร้านก๋วยเตี๋ยวดาวเทียม" };
const CUST_LOC = Object.fromEntries(Object.entries(LOC_CUST).map(([l, c]) => [c, l]));
const A = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n, d = 0) => (n == null ? "" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: 2 }));
const todayTH = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const ymd6 = (d) => d.slice(2).replace(/-/g, "");
const timeTH = (ts) => new Date(Date.parse(ts) + 7 * 3600e3).toISOString().slice(11, 16);
const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };

/* ดึงทุกแถวทีละ 1,000 (เรียงตาม id) แล้วนับเทียบกับจำนวนจริง — ไม่ตรงหรือนับไม่ได้ให้ error ทันที
   filter = ฟังก์ชันใส่เงื่อนไข (ใช้ทั้งตอนนับและตอนดึง ให้ได้ชุดเดียวกัน) */
async function fetchAll(table, cols, filter = (q) => q) {
  const { count, error: ce } = await filter(supabase.from(table).select(cols, { count: "exact", head: true }));
  if (ce) throw ce;
  if (typeof count !== "number") throw new Error(`นับแถว ${table} ไม่ได้`);
  const out = [];
  for (let from = 0; from < count; from += 1000) {
    const { data, error } = await filter(supabase.from(table).select(cols)).order("id").range(from, from + 999);
    if (error) throw error;
    out.push(...data);
  }
  if (out.length !== count) throw new Error(`ดึงข้อมูล ${table} ไม่ครบ (${out.length}/${count}) ลองโหลดใหม่`);
  return out;
}
const chk = ({ data, error }) => { if (error) throw error; return data; };

/* ── โหลดข้อมูลของวันที่เลือก (ทุกร้านพร้อมกัน) ── */
async function loadDay(date) {
  const [items, saleItems, rawMoves, counts, prevCounts, sales, cash, expItems, purchases, profiles, ftBills, ftProducts, whEntries] = await Promise.all([
    supabase.from("inv_items").select("*").order("sort_order").then(chk),
    supabase.from("inv_sale_items").select("*").in("entity", ["GBS", "GBK"]).order("sort_order").then(chk),
    supabase.from("inv_moves").select("*, ft_sales(is_voided)").eq("move_date", date).order("created_at").then(chk),
    supabase.from("inv_counts").select("*").eq("count_date", date).eq("kind", "close").then(chk),
    supabase.from("inv_counts").select("*").lt("count_date", date).eq("kind", "close").in("location", ["gbs", "gbk"])
      .order("count_date", { ascending: false }).limit(400).then(chk),
    supabase.from("daily_sales").select("*").in("entity", ["GBS", "GBK"]).eq("sale_date", date).then(chk),
    supabase.from("cash_counts").select("*").in("entity", ["GBS", "GBK"]).eq("count_date", date).then(chk),
    supabase.from("items").select("*").in("entity", ["GBS", "GBK"]).eq("is_active", true).order("sort_order").then(chk),
    supabase.from("daily_purchases").select("*").in("entity", ["GBS", "GBK"]).eq("purchase_date", date).then(chk),
    supabase.from("profiles").select("id,display_name").then(chk),
    // บิลโรงลูกชิ้นของซัน/เกดวันนี้ (เบิก = บวก · คืน = ติดลบ) — บิลนี้คือข้อมูลจริงของลูกชิ้นแพ็ค/น้ำจิ้ม
    supabase.from("ft_sales").select("id,legacy_id,created_order,created_at,created_by,note,ft_customers!inner(name),ft_sale_items(qty,product_id)")
      .eq("sale_date", date).eq("is_voided", false).in("ft_customers.name", Object.values(LOC_CUST)).then(chk),
    supabase.from("ft_products").select("id,legacy_key,name").then(chk),
    // รายการจากหน้าซื้อของ/คลังกลาง (ลงบัญชีที่หน้าคลังแล้ว) — ดูอย่างเดียว
    supabase.from("journal_entries").select("id,entity,voucher_no,description,source_type,journal_lines(account_code,debit,credit)")
      .in("entity", ["GBS", "GBK"]).eq("entry_date", date).in("source_type", WH_SOURCES).order("voucher_no").then(chk),
  ]);
  // การย้ายที่ผูกกับบิลโรงลูกชิ้นที่ถูกยกเลิก (เช่น ยอดไม้จากบิลเสียบที่ยกเลิก) ไม่นับ
  const moves = rawMoves.filter((m) => !m.ft_sales?.is_voided);
  const ftUnmapped = [];
  // บิลคู่ gbx-<รหัส>-s/-n = ซัน/เกด ↔ ร้านก๋วยเตี๋ยว (ฝั่งติดลบ = ต้นทาง ฝั่งบวก = ปลายทาง) รวมเป็นการย้ายเดียว
  const single = [], pairs = {};
  for (const b of ftBills) {
    const loc = CUST_LOC[b.ft_customers.name], lid = String(b.legacy_id || "");
    if (loc === "ns" && !lid.startsWith("gb")) continue; // บิลร้านก๋วยเตี๋ยวที่ลงจากหน้าโรงลูกชิ้น = ร้านใช้จริง ไม่นับที่นี่
    const when = new Date(Number(b.created_order) || Date.parse(b.created_at)).toISOString();
    const px = lid.match(/^gbx-(.+)-[sn]$/);
    b.ft_sale_items.forEach((li, n) => {
      const q = A(li.qty); if (!q) return;
      const it = items.find((i) => i.ft_product_id === li.product_id);
      if (!it) { if (loc !== "ns") ftUnmapped.push(b); return; }
      const x = { b, n, loc, q, it, when, lid };
      if (px) (pairs[px[1] + "|" + it.id] ||= []).push(x); else single.push(x);
    });
  }
  for (const [k, xs] of Object.entries(pairs)) {
    const from = xs.find((x) => x.q < 0), to = xs.find((x) => x.q > 0);
    if (xs.length === 2 && from && to) moves.push({ id: "ftx:" + k, ftBills: xs.map((x) => x.b), move_date: date, item_id: from.it.id, qty: Math.abs(to.q),
      kind: "transfer", from_loc: from.loc, to_loc: to.loc, source: "gb-move", created_at: from.when, created_by: from.b.created_by });
    else single.push(...xs); // คู่ไม่ครบ (อีกใบถูกยกเลิก) → นับเป็นเบิก/คืนโรงงานตามบิลที่เหลือ
  }
  for (const { b, n, loc, q, it, when, lid } of single)
    moves.push({ id: `ft:${b.id}:${n}`, ftBills: [b], move_date: date, item_id: it.id, qty: Math.abs(q),
      kind: q > 0 ? "draw" : "return", from_loc: q > 0 ? "factory" : loc, to_loc: q > 0 ? loc : "factory",
      source: lid.startsWith("gb") ? "gb-move" : "ft", created_at: when, created_by: b.created_by });
  moves.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  // ต้นงวดของที่ยกยอดข้ามวัน = นับปิดร้านครั้งล่าสุดก่อนวันนี้
  const prev = {};
  for (const c of prevCounts) { const k = c.location + "|" + c.item_id; if (!(k in prev)) prev[k] = A(c.qty); }
  const who = Object.fromEntries(profiles.map((p) => [p.id, p.display_name]));
  return { date, items, saleItems, moves, counts, prev, sales, cash, expItems, purchases, who, ftProducts, ftUnmapped: [...new Set(ftUnmapped)], wh: whEntries };
}

/* ── รายการคลังกลางของร้านหนึ่ง: ต้นทุน (บัญชี 5/6) · VAT ซื้อ (1150) · เงินสดที่ออกจากลิ้นชัก (1010) · โอน (1020)
   wh_purchase = ซื้อให้ร้านนี้ · wh_draw = เบิก/คืนคลังกลาง · wh_pay = ลิ้นชักร้านนี้จ่ายแทนของคลังกลาง/ร้านอื่น */
function whRows(day, ent) {
  const net = (L, f) => r2(L.filter(f).reduce((t, l) => t + A(l.debit) - A(l.credit), 0));
  return (day.wh || []).filter((e) => e.entity === ent).map((e) => {
    const L = e.journal_lines || [];
    return { id: e.id, no: e.voucher_no, title: e.description, type: e.source_type,
      cost: e.source_type === "wh_pay" ? 0 : net(L, (l) => /^[56]/.test(l.account_code)),
      vat: net(L, (l) => l.account_code === "1150-" + ent),
      cash: -net(L, (l) => l.account_code === "1010-" + ent), bank: -net(L, (l) => l.account_code === "1020-" + ent) };
  });
}
const whCash = (day, ent) => r2(whRows(day, ent).reduce((t, w) => t + w.cash, 0));

/* ── คำนวณหน้าขายของร้านหนึ่ง (ใช้ทั้งหน้าจอและตอนลงบัญชี) ── */
function computeSell(day, ent, leftDraft) {
  const loc = SHOPS[ent].loc;
  const itemById = Object.fromEntries(day.items.map((i) => [i.id, i]));
  const usedIds = new Set(day.moves.filter((m) => m.from_loc === loc || m.to_loc === loc).map((m) => m.item_id));
  const rows = day.saleItems.filter((s) => s.entity === ent && (s.is_active || usedIds.has(s.item_id))).map((s) => {
    const it = itemById[s.item_id] || {};
    const open = it.carries_over ? (day.prev[loc + "|" + s.item_id] || 0) : 0;
    const inn = day.moves.filter((m) => m.item_id === s.item_id && m.to_loc === loc).reduce((t, m) => t + A(m.qty), 0);
    const out = day.moves.filter((m) => m.item_id === s.item_id && m.from_loc === loc).reduce((t, m) => t + A(m.qty), 0);
    const saved = day.counts.find((c) => c.location === loc && c.item_id === s.item_id);
    const leftStr = leftDraft && s.item_id in leftDraft ? leftDraft[s.item_id] : saved ? String(saved.qty) : "";
    const left = A(leftStr);
    const sold = r2(open + inn - out - left);
    return { s, it, open, inn: r2(inn), out: r2(out), leftStr, left, sold, amount: r2(sold * A(s.price)), varCost: r2(sold * A(s.var_cost)) };
  });
  const total = r2(rows.reduce((t, r) => t + r.amount, 0));
  const varCost = r2(rows.reduce((t, r) => t + r.varCost, 0));
  return { rows, total, varCost };
}

/* ── ลงบัญชีของวันใหม่ทั้งหมด (ลบใบ gb_* ของวันนั้นแล้วเขียนใหม่ ให้ตรงกับข้อมูลเสมอ) ── */
async function postDay(day, ent) {
  const date = day.date, sfx = "-" + ent, no = (x) => `${ent}-${ymd6(date)}-${x}`;
  const loc = SHOPS[ent].loc;
  const closed = day.cash.find((c) => c.entity === ent && c.is_closed);
  const J = [];
  if (closed) {
    const cashAmt = A(day.sales.find((s) => s.entity === ent && s.channel === "cash")?.amount);
    const trAmt = A(day.sales.find((s) => s.entity === ent && s.channel === "transfer")?.amount);
    const vc = r2(cashAmt * 7 / 107), vt = r2(trAmt * 7 / 107);
    const L = [];
    if (cashAmt) L.push({ code: "1010" + sfx, dr: cashAmt, cr: 0 }, { code: "4010" + sfx, dr: 0, cr: r2(cashAmt - vc) });
    if (trAmt) L.push({ code: "1020" + sfx, dr: trAmt, cr: 0 }, { code: "4020" + sfx, dr: 0, cr: r2(trAmt - vt) });
    if (vc + vt) L.push({ code: "2200" + sfx, dr: 0, cr: r2(vc + vt) });
    if (L.length) J.push({ no: no("A"), title: `ขาย ${SHOPS[ent].name}`, type: "gb_sales", lines: L });
    const v = A(closed.variance);
    if (v) J.push({ no: no("E"), title: v < 0 ? "เงินสดขาด" : "เงินสดเกิน", type: "gb_cash_diff",
      lines: v < 0 ? [{ code: "6800" + sfx, dr: -v, cr: 0 }, { code: "1010" + sfx, dr: 0, cr: -v }]
        : [{ code: "1010" + sfx, dr: v, cr: 0 }, { code: "6800" + sfx, dr: 0, cr: v }] });
    const varCost = computeSell(day, ent).varCost;
    if (varCost > 0) J.push({ no: no("D"), title: "ค่าผันแปร น้ำจิ้ม ไม้เสียบ ถุงใส่ของ (คิดจากไม้ที่ขาย)", type: "gb_variable",
      lines: [{ code: "6210" + sfx, dr: varCost, cr: 0 }, { code: "3010" + sfx, dr: 0, cr: varCost }] });
  }
  // รายจ่าย: จ่ายจากลิ้นชัก = เงินสดร้าน · กองกลาง/ร้านก๋วยเตี๋ยวจ่าย = ทุนเจ้าของ (ไม่ตามหนี้คืน)
  const itemAcc = Object.fromEntries(day.expItems.map((i) => [i.id, i]));
  const exL = [], cr = { cash: 0, ic: 0 };
  for (const p of day.purchases.filter((p) => p.entity === ent && A(p.amount))) {
    const it = itemAcc[p.item_id]; if (!it) continue;
    exL.push({ code: it.account_code, dr: A(p.amount), cr: 0, memo: it.name });
    cr[p.payment_method_override === "cash" ? "cash" : "ic"] += A(p.amount);
  }
  if (cr.cash) exL.push({ code: "1010" + sfx, dr: 0, cr: r2(cr.cash) });
  if (cr.ic) exL.push({ code: "3010" + sfx, dr: 0, cr: r2(cr.ic) });
  if (exL.length) J.push({ no: no("B"), title: `รายจ่าย ${SHOPS[ent].name}`, type: "gb_expense", lines: exL });
  // ซื้อของขายอื่น (ร้านก๋วยเตี๋ยว/กองกลางจ่าย) → ต้นทุนของขายอื่น
  const goods = r2(day.moves.filter((m) => m.kind === "purchase" && m.to_loc === loc && A(m.amount)).reduce((t, m) => t + A(m.amount), 0));
  if (goods) J.push({ no: no("C"), title: "ซื้อของขายอื่น (ร้านก๋วยเตี๋ยว/กองกลางจ่าย)", type: "gb_goods",
    lines: [{ code: "5010" + sfx, dr: goods, cr: 0 }, { code: "3010" + sfx, dr: 0, cr: goods }] });

  chk(await supabase.from("journal_entries").delete().eq("entity", ent).eq("entry_date", date).like("source_type", "gb\\_%"));
  for (const j of J) {
    const e = chk(await supabase.from("journal_entries").insert({ entity: ent, entry_date: date, voucher_no: j.no, description: j.title, source_type: j.type }).select("id").single());
    const lines = j.lines.map((l) => ({ entry_id: e.id, account_code: l.code, debit: r2(l.dr), credit: r2(l.cr), memo: l.memo || null }));
    const d = r2(lines.reduce((t, l) => t + l.debit - l.credit, 0));
    if (d !== 0) throw new Error(`ใบ ${j.no} เดบิตไม่เท่าเครดิต (${d})`);
    chk(await supabase.from("journal_lines").insert(lines));
  }
}

/* ═══════════════ หน้าจอ ═══════════════ */
function Login() {
  const [email, setEmail] = useState(""), [pw, setPw] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
    if (error) setErr(error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : error.message);
    setBusy(false);
  };
  return (
    <form className="card login" onSubmit={go}>
      <h1>ลูกชิ้นปิ้ง</h1>
      <label>อีเมล<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>รหัสผ่าน<input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {err && <p className="red">{err}</p>}
      <button disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
    </form>
  );
}

const Num = ({ value, onChange, ph, w }) => (
  <input className="num" inputMode="decimal" placeholder={ph || ""} style={w ? { width: w } : null}
    value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.\-]/g, ""))} />
);

/* ── บันทึกการย้ายของ 1 รอบ (จาก → ไป) ใช้ทั้งเมนูย้ายของ และปุ่ม "ย้ายของที่เหลือ" ในเมนูขาย ──
   ลูกชิ้นแพ็ค/น้ำจิ้ม ที่เบิกจากหรือคืนโรงงาน → สร้างบิลโรงลูกชิ้น (ราคา 0) ใบเดียว ไม่เก็บซ้ำในตารางย้ายของ
   คืนค่า true ถ้ามีบิลโรงลูกชิ้น */
async function recordMoves(day, items, from, to, qty, note = "", amt = "") {
  const isNew = from === "new";
  const use = to === "use"; // ร้านก๋วยเตี๋ยวใช้เอง
  const kind = isNew ? "new" : use ? "use" : to === "factory" ? "return" : from === "factory" ? "draw" : "transfer";
  if (use && from !== "ns") throw new Error("\"ใช้เอง\" ใช้ได้กับร้านก๋วยเตี๋ยวเท่านั้น");
  const rows = items.filter((i) => A(qty[i.id]) > 0).map((i) => ({
    move_date: day.date, item_id: i.id, qty: A(qty[i.id]),
    kind: isNew ? (i.is_produced ? "produce" : "purchase") : kind,
    from_loc: isNew ? null : from, to_loc: use ? null : to, source: "gb-move", note: note || null,
    amount: isNew && !i.is_produced && A(amt) ? A(amt) : null, paid_by_entity: isNew && !i.is_produced ? "NS" : null,
  }));
  if (!rows.length) throw new Error("ยังไม่ได้ใส่จำนวน");
  if (!isNew && from === to) throw new Error("ต้นทางกับปลายทางต้องไม่ใช่ที่เดียวกัน");
  const itemById = Object.fromEntries(items.map((i) => [i.id, i]));
  // ลูกชิ้นแพ็ค/น้ำจิ้ม: เบิก/คืนโรงงาน และ ซัน/เกด ↔ ร้านก๋วยเตี๋ยว = บิลโรงลูกชิ้น (ข้อมูลจริงที่เดียว)
  const viaFt = kind === "draw" || kind === "return" || (kind === "transfer" && (from === "ns" || to === "ns"));
  const ftRows = viaFt ? rows.filter((r) => itemById[r.item_id].ft_product_id) : [];
  const invRows = rows.filter((r) => !ftRows.includes(r));
  const stamp = Date.now();
  for (const r of invRows) r.created_at = new Date(stamp).toISOString();
  const done = []; // บิลที่สร้างแล้ว (ยกเลิกคืนถ้าขั้นต่อไปพลาด)
  const undo = async () => { for (const id of done) await supabase.rpc("ft_save_record", { r: { id, action: "cancelSale", confirm: id, reason: "บันทึกย้ายของไม่สำเร็จ ยกเลิกอัตโนมัติ" } }); };
  try {
    if (ftRows.length) {
      const keys = Object.fromEntries(day.ftProducts.map((p) => [p.id, p.legacy_key]));
      const line = (r, sign) => {
        const it = itemById[r.item_id];
        return { product: keys[it.ft_product_id], quantity: sign * r.qty, input: 0, mode: it.unit === "กก." ? "batch" : "piece" };
      };
      // เบิก = บิลบวกให้ปลายทาง · คืน = บิลติดลบของต้นทาง · ย้ายกับร้านก๋วยเตี๋ยว = บิลคู่ (ต้นทางติดลบ ปลายทางบวก)
      const u = crypto.randomUUID();
      const bills = kind === "draw" ? [["gb-" + u, to, 1]] : kind === "return" ? [["gb-" + u, from, -1]]
        : [[`gbx-${u}-${from === "ns" ? "n" : "s"}`, from, -1], [`gbx-${u}-${to === "ns" ? "n" : "s"}`, to, 1]];
      for (const [id, loc, sign] of bills) {
        const recItems = ftRows.map((r) => line(r, sign));
        if (recItems.some((x) => !x.product)) throw new Error("ไม่พบสินค้าที่หน้าโรงลูกชิ้น");
        const { error } = await supabase.rpc("ft_save_record", { r: {
          id, kind: "sale", date: day.date, customer: LOC_CUST[loc], items: recItems, total: 0, paid: 0,
          priceGroup: "wholesale", unitPrices: Object.fromEntries(recItems.map((x) => [x.product, 0])),
          note: ["ลงจากหน้าลูกชิ้นปิ้ง", kind === "transfer" ? `${LOC_NAME[from]} → ${LOC_NAME[to]}` : "", note].filter(Boolean).join(" · "), createdOrder: stamp } });
        if (error) throw error;
        done.push(id);
      }
    }
    if (invRows.length) chk(await supabase.from("inv_moves").insert(invRows));
  } catch (e) { await undo(); throw e; }
  return ftRows.length > 0;
}

/* ── เมนูย้ายของ ── */
function MovesTab({ day, reload, setMsg }) {
  const [from, setFrom] = useState("factory"), [to, setTo] = useState("gbs");
  const [qty, setQty] = useState({}), [amt, setAmt] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const items = day.items.filter((i) => i.is_active && ["ลูกชิ้นปิ้ง", "ลูกชิ้นแพ็ค", "น้ำจิ้ม"].includes(i.category));
  const isNew = from === "new";
  useEffect(() => { if (to === "use" && from !== "ns") setTo("factory"); }, [from]);
  const sameDay = !isNew && from !== to && day.moves.some((m) => m.from_loc === from && m.to_loc === to);
  const save = async () => {
    setBusy(true);
    try {
      const ft = await recordMoves(day, items, from, to, qty, note, amt);
      setQty({}); setAmt(""); setNote("");
      setMsg(ft ? "บันทึกแล้ว · ลูกชิ้นแพ็ค/น้ำจิ้ม ขึ้นเป็นบิลที่หน้าโรงลูกชิ้นด้วย" : "บันทึกการย้ายแล้ว"); await reload();
    } catch (e) { setMsg("บันทึกไม่ได้: " + e.message); }
    setBusy(false);
  };
  const del = async (g) => {
    const bills = [...new Map(g.bills.map((b) => [b.id, b])).values()];
    const fromFt = bills.some((b) => !String(b.legacy_id || "").startsWith("gb"));
    if (!confirm(bills.length ? `ลบรายการย้ายนี้? บิลที่หน้าโรงลูกชิ้น${fromFt ? " (ลงจากหน้าโรงลูกชิ้น)" : ""} จะถูกยกเลิกด้วย` : "ลบรายการย้ายนี้?")) return;
    try {
      if (g.ids.length) chk(await supabase.from("inv_moves").delete().in("id", g.ids));
      for (const b of bills) {
        const key = b.legacy_id || b.id;
        const { error } = await supabase.rpc("ft_save_record", { r: { id: key, action: "cancelSale", confirm: key, reason: "ลบจากหน้าลูกชิ้นปิ้ง" } });
        if (error) throw error;
      }
      await reload();
    } catch (e) { setMsg(e.message); }
  };
  // รวมรายการที่บันทึกพร้อมกันเป็นแถวเดียว
  const groups = [];
  for (const m of day.moves.filter((m) => m.source === "gb-move" || MOVE_LOCS.includes(m.from_loc) || MOVE_LOCS.includes(m.to_loc))) {
    const k = m.created_at.slice(0, 19) + m.from_loc + m.to_loc;
    let g = groups.find((x) => x.k === k);
    if (!g) groups.push(g = { k, m, ids: [], bills: [], q: {}, ft: false });
    if (m.ftBills) { g.bills.push(...m.ftBills); if (m.source === "ft") g.ft = true; } else g.ids.push(m.id);
    g.q[m.item_id] = r2((g.q[m.item_id] || 0) + A(m.qty));
  }
  const tot = (loc, dir) => Object.fromEntries(items.map((i) => [i.id, r2(day.moves.filter((m) => m.item_id === i.id && (dir === "in" ? m.to_loc : m.from_loc) === loc).reduce((t, m) => t + A(m.qty), 0))]));
  return (
    <>
      <div className="card">
        <h2>บันทึกการย้ายของ</h2>
        <div className="row">
          <label>จาก<select value={from} onChange={(e) => setFrom(e.target.value)}>
            {MOVE_LOCS.map((l) => <option key={l} value={l}>{LOC_NAME[l]}</option>)}
            <option value="new">เข้าใหม่ (ผลิต/ซื้อเข้า)</option></select></label>
          <span className="arrow">→</span>
          <label>ไป<select value={to} onChange={(e) => setTo(e.target.value)}>
            {MOVE_LOCS.map((l) => <option key={l} value={l}>{LOC_NAME[l]}</option>)}
            {from === "ns" && <option value="use">ร้านก๋วยเตี๋ยวใช้เอง</option>}</select></label>
        </div>
        {sameDay && <p className="warn">วันนี้มีรายการ {LOC_NAME[from]} → {LOC_NAME[to]} แล้ว ถ้าเป็นรอบใหม่บันทึกต่อได้เลย (ระวังลงซ้ำ)</p>}
        <table className="grid"><tbody>
          {items.map((i) => (
            <tr key={i.id}><td>{i.name}</td><td className="r"><Num value={qty[i.id] ?? ""} onChange={(v) => setQty({ ...qty, [i.id]: v })} w="6em" /></td><td className="muted">{i.unit}</td></tr>
          ))}
        </tbody></table>
        {isNew && <label>ค่าของ (ถ้าซื้อเข้า เช่น โคขุน · ร้านก๋วยเตี๋ยวจ่าย)<Num value={amt} onChange={setAmt} ph="บาท" /></label>}
        <label>หมายเหตุ<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button disabled={busy} onClick={save}>บันทึก</button>
        <p className="muted small">ลูกชิ้นแพ็ค/น้ำจิ้ม ที่เบิกหรือคืนโรงงาน = ขึ้นเป็นบิลที่หน้าโรงลูกชิ้นให้เอง (ราคา 0) · บิลซัน/เกดที่ลงจากหน้าโรงลูกชิ้นก็ขึ้นที่นี่ (ป้าย "หน้าโรงลูกชิ้น") ลงที่เดียวพอ · ไม้ปิ้งที่โรงงานได้จากช่อง "ได้กี่ไม้" ของบิลเสียบลูกชิ้นปิ้งที่หน้าโรงลูกชิ้น</p>
        {day.ftUnmapped.length > 0 && <p className="warn">บิลโรงลูกชิ้นของซัน/เกดวันนี้มีสินค้าที่ไม่มีในลูกชิ้นปิ้ง (เช่น เนื้อเอ็น) ไม่ได้นับในหน้านี้</p>}
      </div>
      <div className="card">
        <h2>รายการวันนี้</h2>
        {!groups.length && <p className="muted">ยังไม่มี</p>}
        <div className="scroll"><table className="grid"><thead><tr><th>เวลา</th><th>จาก → ไป</th>{items.map((i) => <th key={i.id}>{i.name}</th>)}<th>คนลง</th><th></th></tr></thead>
          <tbody>{groups.map((g) => (
            <tr key={g.k}><td>{timeTH(g.m.created_at)}</td><td className="nw">{g.m.from_loc ? LOC_NAME[g.m.from_loc] : "เข้าใหม่"} → {g.m.kind === "use" ? "ใช้เอง" : LOC_NAME[g.m.to_loc] || "-"}{g.ft && <span className="tag">หน้าโรงลูกชิ้น</span>}{g.m.kind === "produce" && g.m.ft_sale_id && <span className="tag">เสียบไม้</span>}</td>
              {items.map((i) => <td key={i.id} className="r">{g.q[i.id] ? fmt(g.q[i.id]) : ""}</td>)}
              <td className="muted">{day.who[g.m.created_by] || ""}</td><td><button className="link" onClick={() => del(g)}>ลบ</button></td></tr>
          ))}</tbody></table></div>
      </div>
      <div className="card">
        <h2>ยอดรวมวันนี้</h2>
        <div className="scroll"><table className="grid"><thead><tr><th></th>{items.map((i) => <th key={i.id}>{i.name}</th>)}</tr></thead>
          <tbody>{MOVE_LOCS.flatMap((l) => [["in", "รับเข้า"], ["out", "ส่งออก"]].map(([d, lab]) => {
            const t = tot(l, d);
            return <tr key={l + d}><td className="nw">{LOC_NAME[l]} {lab}</td>{items.map((i) => <td key={i.id} className="r">{t[i.id] ? fmt(t[i.id]) : ""}</td>)}</tr>;
          }))}</tbody></table></div>
      </div>
      <FactoryStock items={items.filter((i) => i.unit === "ไม้")} date={day.date} reload={reload} setMsg={setMsg} />
    </>
  );
}

/* สต๊อกไม้ปิ้งที่โรงงาน (ยกยอดข้ามวัน) + นับจริงแล้วปรับยอด */
function FactoryStock({ items, date, reload, setMsg }) {
  const [stock, setStock] = useState(null), [cnt, setCnt] = useState({});
  const load = useCallback(async () => {
    const ids = items.map((i) => i.id);
    if (!ids.length) return setStock({});
    const rows = await fetchAll("inv_moves", "id,item_id,qty,from_loc,to_loc,ft_sales(is_voided)", (q) => q.in("item_id", ids).lte("move_date", date).or("from_loc.eq.factory,to_loc.eq.factory"));
    const s = Object.fromEntries(ids.map((i) => [i, 0]));
    for (const m of rows) if (!m.ft_sales?.is_voided) s[m.item_id] = r2(s[m.item_id] + (m.to_loc === "factory" ? 1 : -1) * A(m.qty));
    setStock(s);
  }, [items.map((i) => i.id).join(), date]);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);
  const adjust = async () => {
    const rows = items.filter((i) => cnt[i.id] !== undefined && cnt[i.id] !== "" && r2(A(cnt[i.id]) - stock[i.id]) !== 0)
      .map((i) => { const d = r2(A(cnt[i.id]) - stock[i.id]); return { move_date: date, item_id: i.id, kind: "adjust", qty: Math.abs(d), from_loc: d < 0 ? "factory" : null, to_loc: d > 0 ? "factory" : null, source: "gb-count", note: `นับจริง ${A(cnt[i.id])} (ระบบ ${stock[i.id]})` }; });
    const counts = items.filter((i) => cnt[i.id] !== undefined && cnt[i.id] !== "").map((i) => ({ count_date: date, location: "factory", item_id: i.id, qty: A(cnt[i.id]), kind: "spot" }));
    if (!counts.length) return setMsg("ยังไม่ได้ใส่ยอดนับ");
    try {
      chk(await supabase.from("inv_counts").upsert(counts, { onConflict: "count_date,location,item_id,kind" }));
      if (rows.length) chk(await supabase.from("inv_moves").insert(rows));
      setCnt({}); setMsg("ปรับสต๊อกตามที่นับแล้ว"); await reload(); await load();
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="card">
      <h2>สต๊อกไม้ปิ้งที่โรงงาน (ถึงสิ้นวันนี้)</h2>
      <table className="grid"><thead><tr><th></th><th>ในระบบ</th><th>นับจริง</th><th>ส่วนต่าง</th></tr></thead><tbody>
        {items.map((i) => { const s = stock?.[i.id]; const has = cnt[i.id] !== undefined && cnt[i.id] !== "";
          return <tr key={i.id}><td>{i.name}</td><td className="r">{s == null ? "…" : fmt(s)}</td>
            <td className="r"><Num value={cnt[i.id] ?? ""} onChange={(v) => setCnt({ ...cnt, [i.id]: v })} w="6em" /></td>
            <td className={"r " + (has && A(cnt[i.id]) - s < 0 ? "red" : "")}>{has && s != null ? fmt(r2(A(cnt[i.id]) - s)) : ""}</td></tr>; })}
      </tbody></table>
      <button onClick={adjust}>บันทึกยอดนับ และปรับสต๊อก</button>
    </div>
  );
}

/* ── เมนูขาย (นับของ + รับเงิน + ปิดลิ้นชัก) ── */
function SellTab({ day, ent, reload, setMsg }) {
  const loc = SHOPS[ent].loc;
  const [left, setLeft] = useState({}), [dest, setDest] = useState({});
  const saleRow = (ch) => day.sales.find((s) => s.entity === ent && s.channel === ch);
  const cc = day.cash.find((c) => c.entity === ent);
  const [tr, setTr] = useState(""), [open, setOpen] = useState(""), [counted, setCounted] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => {
    setTr(saleRow("transfer") ? String(A(saleRow("transfer").amount)) : "");
    setOpen(cc ? String(A(cc.opening_cash)) : ""); setCounted(cc && cc.counted_cash != null ? String(A(cc.counted_cash)) : "");
  }, [day, ent]);
  useEffect(() => { setLeft({}); setDest({}); }, [day.date, ent]); // ยอดเหลือที่พิมพ์ค้างไว้ไม่หายตอนโหลดใหม่หลังย้ายของ
  const sell = computeSell(day, ent, left);
  const trAmt = SHOPS[ent].bank ? A(tr) : 0;
  const cashSales = r2(sell.total - trAmt);
  const whOut = whCash(day, ent); // จ่ายจากลิ้นชักที่หน้าซื้อของ
  const drawerOut = r2(day.purchases.filter((p) => p.entity === ent && p.payment_method_override === "cash").reduce((t, p) => t + A(p.amount), 0) + whOut);
  const expected = r2(A(open) + cashSales - drawerOut);
  const variance = counted === "" ? null : r2(A(counted) - expected);
  const neg = sell.rows.some((r) => r.sold < 0);

  const close = async () => {
    if (counted === "") return setMsg("ใส่เงินสดที่นับได้ก่อนปิดยอด");
    if (neg && !confirm("มีสินค้าที่ขายได้ติดลบ (ของเหลือมากกว่าที่รับมา) ยังจะปิดยอดไหม?")) return;
    setBusy(true);
    try {
      chk(await supabase.from("inv_counts").delete().eq("count_date", day.date).eq("location", loc).eq("kind", "close"));
      const counts = sell.rows.filter((r) => r.leftStr !== "").map((r) => ({ count_date: day.date, location: loc, item_id: r.s.item_id, qty: r.left, kind: "close" }));
      if (counts.length) chk(await supabase.from("inv_counts").insert(counts));
      chk(await supabase.from("daily_sales").delete().eq("entity", ent).eq("sale_date", day.date));
      const sales = [{ entity: ent, sale_date: day.date, channel: "cash", amount: cashSales }];
      if (trAmt) sales.push({ entity: ent, sale_date: day.date, channel: "transfer", amount: trAmt });
      chk(await supabase.from("daily_sales").insert(sales));
      chk(await supabase.from("cash_counts").upsert({ entity: ent, count_date: day.date, opening_cash: A(open), counted_cash: A(counted), expected_cash: expected, variance, is_closed: true }, { onConflict: "entity,count_date" }));
      const fresh = await loadDay(day.date);
      await postDay(fresh, ent);
      setMsg(`ปิดยอด ${SHOPS[ent].name} แล้ว`); await reload();
    } catch (e) { setMsg("ปิดยอดไม่ได้: " + e.message); }
    setBusy(false);
  };
  const reopen = async () => {
    if (!confirm("เปิดแก้ไขวันนี้? ใบบัญชีขาย/เงินขาดเกินของวันนี้จะถูกลบ จนกว่าจะกดปิดยอดอีกครั้ง")) return;
    try {
      chk(await supabase.from("cash_counts").update({ is_closed: false }).eq("entity", ent).eq("count_date", day.date));
      const fresh = await loadDay(day.date); await postDay(fresh, ent); await reload();
    } catch (e) { setMsg(e.message); }
  };
  // ปุ่ม "ย้ายของที่เหลือ": ของที่เหลือแต่ละแถวส่งไปตามที่เลือก แล้วช่องเหลือกลับเป็น 0
  const DEST = [["", "เก็บไว้ที่ร้าน"], [ent === "GBS" ? "gbk" : "gbs", ent === "GBS" ? "เกด" : "ซัน"], ["factory", "โรงงาน"], ["ns", "ร้านก๋วยเตี๋ยว"]];
  const toMove = sell.rows.filter((r) => r.left > 0 && dest[r.s.item_id]);
  const moveLeft = async () => {
    if (!toMove.length) return setMsg("ยังไม่ได้เลือกว่าของที่เหลือจะส่งไปไหน");
    const byTo = {};
    for (const r of toMove) (byTo[dest[r.s.item_id]] ||= {})[r.s.item_id] = r.left;
    const txt = Object.entries(byTo).map(([t, q]) => `→ ${LOC_NAME[t]}: ` + toMove.filter((r) => q[r.s.item_id]).map((r) => `${r.it.name} ${fmt(r.left)}`).join(", ")).join("\n");
    if (!confirm(`ย้ายของที่เหลือของ${SHOPS[ent].name}\n${txt}`)) return;
    setBusy(true);
    const done = [];
    try {
      for (const [t, q] of Object.entries(byTo)) { await recordMoves(day, day.items, loc, t, q, "ของเหลือตอนปิดร้าน"); done.push(...Object.keys(q)); }
      setMsg("ย้ายของที่เหลือแล้ว");
    } catch (e) { setMsg((done.length ? "ย้ายได้บางส่วน · " : "") + "ย้ายไม่ได้: " + e.message); }
    // แถวที่ย้ายสำเร็จ → ช่องเหลือเป็น 0 (ไม่ให้หักซ้ำ)
    if (done.length) {
      const l = { ...left }, d = { ...dest };
      for (const id of done) { l[id] = ""; delete d[id]; }
      await reload(); setLeft(l); setDest(d);
    }
    setBusy(false);
  };
  const closed = cc?.is_closed;
  return (
    <>
      <div className="card">
        <h2>นับของ {SHOPS[ent].name} {closed && <span className="tag">ปิดยอดแล้ว</span>}</h2>
        <div className="scroll"><table className="grid"><thead><tr><th>สินค้า</th><th>ต้นงวด</th><th>รับเข้า</th><th>ส่งออก</th><th>เหลือ (นับ)</th>{!closed && <th>ส่งไป</th>}<th>ขายได้</th><th>ราคา</th><th>ยอดเงิน</th></tr></thead>
          <tbody>{sell.rows.map((r) => (
            <tr key={r.s.id} className={r.s.is_active ? "" : "muted"}><td className="nw">{r.it.name}<span className="muted small"> {r.it.unit}</span></td>
              <td className="r">{r.open ? fmt(r.open) : ""}</td><td className="r">{r.inn ? fmt(r.inn) : ""}</td><td className="r">{r.out ? fmt(r.out) : ""}</td>
              <td className="r">{closed ? fmt(r.left) : <Num value={r.leftStr} ph="0" w="5em" onChange={(v) => setLeft({ ...left, [r.s.item_id]: v })} />}</td>
              {!closed && <td>{r.left > 0 && <select className="dest" value={dest[r.s.item_id] || ""} onChange={(e) => setDest({ ...dest, [r.s.item_id]: e.target.value })}>
                {DEST.map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select>}</td>}
              <td className={"r b " + (r.sold < 0 ? "red" : "")}>{fmt(r.sold)}</td><td className="r">{fmt(A(r.s.price))}</td><td className="r">{fmt(r.amount)}</td></tr>
          ))}</tbody>
          <tfoot><tr><td colSpan={closed ? 7 : 8}>รวมยอดขาย</td><td className="r b">{fmt(sell.total)}</td></tr></tfoot></table></div>
        {!closed && toMove.length > 0 && <button disabled={busy} onClick={moveLeft}>ย้ายของที่เหลือ ({toMove.length} รายการ)</button>}
        <p className="muted small">ขายได้ = ต้นงวด + รับเข้า − ส่งออก − เหลือ · ใส่ "เหลือ" แล้วเลือก "ส่งไป" ต่อท้ายแถว → กดปุ่มย้ายของที่เหลือ ระบบลงเมนูย้ายของให้และเปลี่ยนช่องเหลือเป็น 0 เอง · "เก็บไว้ที่ร้าน" = ไม่ย้าย (น้ำจิ้มที่เหลือยกไปเป็นต้นงวดพรุ่งนี้) · ของอย่างเดียวกันแบ่งไปสองที่ ให้ลงที่เมนูย้ายของ</p>
      </div>
      <div className="card">
        <h2>รับเงิน และปิดลิ้นชัก</h2>
        <table className="grid kv"><tbody>
          <tr><td>ยอดขายรวม</td><td className="r">{fmt(sell.total)}</td></tr>
          {SHOPS[ent].bank && <tr><td>เงินโอน (เข้าบัญชีเกด)</td><td className="r">{closed ? fmt(trAmt) : <Num value={tr} onChange={setTr} ph="0" />}</td></tr>}
          <tr><td>ขายเงินสด</td><td className="r">{fmt(cashSales)}</td></tr>
          <tr><td>เงินทอนต้นวัน</td><td className="r">{closed ? fmt(A(open)) : <Num value={open} onChange={setOpen} ph="0" />}</td></tr>
          <tr><td>จ่ายจากลิ้นชัก (เมนูรายจ่าย{whOut ? " + หน้าซื้อของ " + fmt(whOut) : ""})</td><td className="r">{drawerOut ? "−" + fmt(drawerOut) : "0"}</td></tr>
          <tr><td className="b">เงินสดที่ควรมี</td><td className="r b">{fmt(expected)}</td></tr>
          <tr><td>เงินสดที่นับได้</td><td className="r">{closed ? fmt(A(counted)) : <Num value={counted} onChange={setCounted} />}</td></tr>
          {variance != null && <tr><td>{variance < 0 ? "เงินขาด" : variance > 0 ? "เงินเกิน" : "ตรงพอดี"}</td><td className={"r b " + (variance < 0 ? "red" : "green")}>{fmt(variance)}</td></tr>}
        </tbody></table>
        {closed ? <button className="ghost" onClick={reopen}>เปิดแก้ไขวันนี้</button>
          : <button disabled={busy} onClick={close}>{busy ? "กำลังบันทึก…" : "ปิดยอดวันนี้"}</button>}
      </div>
    </>
  );
}

/* ── เมนูรายจ่าย ── */
function ExpenseTab({ day, ent, reload, setMsg }) {
  const loc = SHOPS[ent].loc;
  const items = day.expItems.filter((i) => i.entity === ent);
  const [draft, setDraft] = useState({}), [busy, setBusy] = useState(false);
  useEffect(() => {
    const d = {};
    for (const i of items) { const p = day.purchases.find((x) => x.entity === ent && x.item_id === i.id); d[i.id] = { amt: p ? String(A(p.amount)) : "", m: p?.payment_method_override === "cash" ? "cash" : "intercompany" }; }
    setDraft(d);
  }, [day, ent]);
  const save = async () => {
    setBusy(true);
    try {
      chk(await supabase.from("daily_purchases").delete().eq("entity", ent).eq("purchase_date", day.date));
      const rows = items.filter((i) => A(draft[i.id]?.amt)).map((i) => ({ entity: ent, purchase_date: day.date, item_id: i.id, amount: A(draft[i.id].amt), amount_manual: true, payment_method_override: draft[i.id].m, vendor_name: "—" }));
      if (rows.length) chk(await supabase.from("daily_purchases").insert(rows));
      await postDay(await loadDay(day.date), ent);
      setMsg("บันทึกรายจ่ายแล้ว"); await reload();
    } catch (e) { setMsg("บันทึกไม่ได้: " + e.message); }
    setBusy(false);
  };
  // ซื้อของขายอื่น
  const goodsItems = day.saleItems.filter((s) => s.entity === ent && s.is_active).map((s) => day.items.find((i) => i.id === s.item_id)).filter((i) => i && !i.is_produced && i.unit !== "ไม้");
  const [g, setG] = useState({ item: "", qty: "", amt: "" });
  const buys = day.moves.filter((m) => m.kind === "purchase" && m.to_loc === loc);
  const addBuy = async () => {
    if (!g.item || !A(g.qty)) return setMsg("เลือกสินค้าและใส่จำนวน");
    try {
      chk(await supabase.from("inv_moves").insert({ move_date: day.date, kind: "purchase", item_id: g.item, qty: A(g.qty), to_loc: loc, amount: A(g.amt) || null, paid_by_entity: "NS", source: "gb-expense" }));
      setG({ item: "", qty: "", amt: "" }); await postDay(await loadDay(day.date), ent); await reload();
    } catch (e) { setMsg(e.message); }
  };
  const delBuy = async (id) => { if (!confirm("ลบรายการซื้อนี้?")) return; try { chk(await supabase.from("inv_moves").delete().eq("id", id)); await postDay(await loadDay(day.date), ent); await reload(); } catch (e) { setMsg(e.message); } };
  const varCost = computeSell(day, ent).varCost;
  return (
    <>
      <div className="card">
        <h2>รายจ่าย {SHOPS[ent].name}</h2>
        <table className="grid"><thead><tr><th>รายการ</th><th>บาท</th><th>จ่ายจาก</th></tr></thead><tbody>
          {items.map((i) => (
            <tr key={i.id}><td>{i.name}</td><td className="r"><Num value={draft[i.id]?.amt ?? ""} onChange={(v) => setDraft({ ...draft, [i.id]: { ...draft[i.id], amt: v } })} w="6em" /></td>
              <td><select value={draft[i.id]?.m || "intercompany"} onChange={(e) => setDraft({ ...draft, [i.id]: { ...draft[i.id], m: e.target.value } })}>
                <option value="intercompany">กองกลาง/ร้านก๋วยเตี๋ยว</option><option value="cash">เงินในลิ้นชัก</option></select></td></tr>
          ))}
          <tr className="muted"><td>ค่าผันแปร น้ำจิ้ม ไม้เสียบ ถุงใส่ของ (อัตโนมัติ)</td><td className="r">{fmt(varCost, 2)}</td><td className="small">คิดจากไม้ที่ขายได้ ลงตอนปิดยอด</td></tr>
        </tbody></table>
        <p className="muted small">ค่าเช่า (รวมน้ำไฟ) ให้ลงครั้งเดียวที่วันสิ้นเดือน · "จ่ายจากลิ้นชัก" จะหักจากเงินสดที่ควรมีในเมนูขาย</p>
        <button disabled={busy} onClick={save}>บันทึกรายจ่าย</button>
      </div>
      <WhCard day={day} ent={ent} />
      <div className="card">
        <h2>ซื้อของขายอื่น (ร้านก๋วยเตี๋ยวจ่าย)</h2>
        {!goodsItems.length && <p className="muted small">ยังไม่มีสินค้าซื้อมาขายต่อ เพิ่มได้ที่เมนูสินค้า</p>}
        <div className="row">
          <select value={g.item} onChange={(e) => setG({ ...g, item: e.target.value })}><option value="">เลือกสินค้า</option>{goodsItems.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
          <Num value={g.qty} onChange={(v) => setG({ ...g, qty: v })} ph="จำนวน" w="5em" />
          <Num value={g.amt} onChange={(v) => setG({ ...g, amt: v })} ph="บาท" w="6em" />
          <button onClick={addBuy}>เพิ่ม</button>
        </div>
        <table className="grid"><tbody>{buys.map((m) => { const it = day.items.find((i) => i.id === m.item_id) || {};
          return <tr key={m.id}><td>{it.name}</td><td className="r">{fmt(A(m.qty))} {it.unit}</td><td className="r">{fmt(A(m.amount))} บาท</td><td><button className="link" onClick={() => delBuy(m.id)}>ลบ</button></td></tr>; })}</tbody></table>
        <p className="muted small">จำนวนที่ซื้อจะขึ้นเป็น "รับเข้า" ในเมนูขายให้อัตโนมัติ</p>
      </div>
    </>
  );
}

/* ── การ์ด "จากหน้าซื้อของ / คลังกลาง" — ดูอย่างเดียว แก้/ลบที่หน้าคลังกลางที่เดียว ── */
function WhCard({ day, ent }) {
  const rows = whRows(day, ent);
  if (!rows.length) return null;
  const T = rows.reduce((t, w) => ({ cost: t.cost + w.cost, vat: t.vat + w.vat, cash: t.cash + w.cash }), { cost: 0, vat: 0, cash: 0 });
  const kind = { wh_purchase: "ซื้อให้ร้าน", wh_draw: "เบิก/คืนคลัง", wh_pay: "จ่ายแทน" };
  return (
    <div className="card">
      <h2>จากหน้าซื้อของ / คลังกลาง <span className="tag">ดูอย่างเดียว</span></h2>
      <div className="scroll"><table className="grid"><thead><tr><th>รายการ</th><th>ต้นทุน</th><th>VAT ซื้อ</th><th>จ่ายจากลิ้นชัก</th></tr></thead>
        <tbody>{rows.map((w) => (
          <tr key={w.id}><td>{w.title}<span className="muted small"> · {kind[w.type]} · {w.no}</span></td>
            <td className="r">{w.cost ? fmt(w.cost, 2) : ""}</td><td className="r">{w.vat ? fmt(w.vat, 2) : ""}</td><td className="r">{w.cash ? fmt(w.cash, 2) : ""}</td></tr>
        ))}</tbody>
        <tfoot><tr><td>รวม</td><td className="r b">{fmt(r2(T.cost), 2)}</td><td className="r">{fmt(r2(T.vat), 2)}</td><td className="r">{fmt(r2(T.cash), 2)}</td></tr></tfoot></table></div>
      <p className="muted small">ลงบัญชีให้แล้วที่หน้าซื้อของ · แก้/ลบได้ที่ <a href={WH_LINK}>หน้าคลังกลาง</a> เท่านั้น · "จ่ายจากลิ้นชัก" หักจากเงินสดที่ควรมีในเมนูขายให้แล้ว</p>
    </div>
  );
}

/* ── เมนูสรุป: วันนี้ + รายเดือน (จากบัญชีจริง) ── */
function SummaryTab({ day, ent, setMsg }) {
  const ym = day.date.slice(0, 7);
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      const lines = await fetchAll("journal_lines", "id,debit,credit,account_code,journal_entries!inner(entry_date,entity)",
        (q) => q.eq("journal_entries.entity", ent).gte("journal_entries.entry_date", ym + "-01").lte("journal_entries.entry_date", monthEnd(ym)));
      const by = {};
      for (const l of lines) {
        const d = l.journal_entries.entry_date, c = l.account_code.slice(0, 4), x = by[d] || (by[d] = { d, sales: 0, vat: 0, cost: 0, exp: 0, diff: 0 });
        const net = A(l.credit) - A(l.debit);
        if (c[0] === "4") x.sales += net;
        else if (c === "2200") x.vat += net;
        else if (c === "6800") x.diff += net;
        else if (c[0] === "5") x.cost -= net;
        else if (c[0] === "6") x.exp -= net;
      }
      if (live) setRows(Object.values(by).sort((a, b) => (a.d < b.d ? -1 : 1)));
    })().catch((e) => setMsg(e.message));
    return () => { live = false; };
  }, [ent, ym, day]);
  const sell = computeSell(day, ent);
  let cum = 0;
  const T = (rows || []).reduce((t, r) => ({ sales: t.sales + r.sales, vat: t.vat + r.vat, cost: t.cost + r.cost, exp: t.exp + r.exp, diff: t.diff + r.diff }), { sales: 0, vat: 0, cost: 0, exp: 0, diff: 0 });
  return (
    <>
      <div className="card">
        <h2>วันนี้ {SHOPS[ent].name}</h2>
        <table className="grid kv"><tbody>
          <tr><td>ยอดขาย (รวม VAT)</td><td className="r">{fmt(sell.total)}</td></tr>
          <tr><td>VAT ในยอดขาย (×7/107)</td><td className="r">{fmt(r2(sell.total * 7 / 107), 2)}</td></tr>
          <tr><td>ไม้ปิ้งที่ขายได้</td><td className="r">{fmt(sell.rows.filter((r) => r.it.unit === "ไม้").reduce((t, r) => t + r.sold, 0))} ไม้</td></tr>
        </tbody></table>
        <p className="muted small">ตัวเลขบัญชีของวันจะครบหลังกดปิดยอด · ยังไม่หักต้นทุนลูกชิ้น (พักไว้คุยทีหลัง)</p>
      </div>
      <div className="card">
        <h2>รายเดือน {ym}</h2>
        {!rows ? <p className="muted">กำลังโหลด…</p> : (
          <div className="scroll"><table className="grid"><thead><tr><th>วันที่</th><th>ยอดขายสุทธิ</th><th>VAT</th><th>ต้นทุน</th><th>ค่าใช้จ่าย</th><th>กำไร</th><th>สะสม</th></tr></thead>
            <tbody>{rows.map((r) => { const p = r2(r.sales - r.cost - r.exp); cum = r2(cum + p);
              return <tr key={r.d}><td>{r.d.slice(8)}</td><td className="r">{fmt(r.sales)}</td><td className="r">{fmt(r.vat)}</td><td className="r">{fmt(r.cost)}</td><td className="r">{fmt(r.exp)}</td><td className={"r " + (p < 0 ? "red" : "")}>{fmt(p)}</td><td className="r">{fmt(cum)}</td></tr>; })}</tbody>
            <tfoot><tr><td>รวม</td><td className="r">{fmt(T.sales)}</td><td className="r">{fmt(T.vat)}</td><td className="r">{fmt(T.cost)}</td><td className="r">{fmt(T.exp)}</td><td className="r b">{fmt(r2(T.sales - T.cost - T.exp))}</td><td></td></tr></tfoot></table></div>)}
        {rows && <p className="small">เงินสดขาด/เกิน เดือนนี้รวม: <b className={T.diff < 0 ? "red" : ""}>{fmt(r2(T.diff))}</b> บาท (รวมอยู่ในค่าใช้จ่ายแล้ว)</p>}
        <p className="muted small">ยอดขายสุทธิ = ไม่รวม VAT · กำไรยังไม่หักต้นทุนลูกชิ้น</p>
      </div>
    </>
  );
}

/* ── เมนูสินค้า/ราคา ── */
function ProductsTab({ day, ent, reload, setMsg }) {
  const list = day.saleItems.filter((s) => s.entity === ent).map((s) => ({ s, it: day.items.find((i) => i.id === s.item_id) || {} }));
  const [edit, setEdit] = useState({});
  useEffect(() => setEdit({}), [day, ent]);
  const [nw, setNw] = useState({ name: "", unit: "ชิ้น", price: "", carry: true, both: true });
  const saveRow = async (s) => {
    const e = edit[s.id]; if (!e) return;
    try { chk(await supabase.from("inv_sale_items").update({ price: e.price === undefined ? s.price : A(e.price), var_cost: e.vc === undefined ? s.var_cost : A(e.vc) }).eq("id", s.id)); setMsg("บันทึกราคาแล้ว"); await reload(); } catch (x) { setMsg(x.message); }
  };
  const toggle = async (s) => { try { chk(await supabase.from("inv_sale_items").update({ is_active: !s.is_active }).eq("id", s.id)); await reload(); } catch (x) { setMsg(x.message); } };
  const remove = async (s, it) => {
    const { count: c1 } = await supabase.from("inv_moves").select("id", { count: "exact", head: true }).eq("item_id", s.item_id);
    const { count: c2 } = await supabase.from("inv_counts").select("id", { count: "exact", head: true }).eq("item_id", s.item_id);
    if (c1 || c2) return setMsg(`ลบ "${it.name}" ไม่ได้ เพราะเคยมีการย้าย/นับแล้ว ให้ใช้ "เลิกขาย" แทน`);
    if (!confirm(`ลบ "${it.name}" ออกจากร้าน${SHOPS[ent].name}ถาวร?`)) return;
    try { chk(await supabase.from("inv_sale_items").delete().eq("id", s.id)); await reload(); } catch (x) { setMsg(x.message); }
  };
  const add = async () => {
    const name = nw.name.trim(); if (!name) return setMsg("ใส่ชื่อสินค้า");
    try {
      let it = day.items.find((i) => i.name === name);
      if (!it) it = chk(await supabase.from("inv_items").insert({ name, unit: nw.unit || "ชิ้น", tier: 1, category: "ของขายอื่น", is_produced: false, carries_over: nw.carry, sort_order: 100 }).select().single());
      const ents = nw.both ? ["GBS", "GBK"] : [ent];
      chk(await supabase.from("inv_sale_items").upsert(ents.map((e) => ({ entity: e, item_id: it.id, price: A(nw.price), is_active: true, sort_order: 100 })), { onConflict: "entity,item_id" }));
      setNw({ name: "", unit: "ชิ้น", price: "", carry: true, both: true }); setMsg("เพิ่มสินค้าแล้ว"); await reload();
    } catch (x) { setMsg(x.message); }
  };
  return (
    <>
      <div className="card">
        <h2>สินค้าและราคา {SHOPS[ent].name}</h2>
        <div className="scroll"><table className="grid"><thead><tr><th>สินค้า</th><th>ราคา</th><th>ค่าผันแปร/หน่วย</th><th></th></tr></thead><tbody>
          {list.map(({ s, it }) => (
            <tr key={s.id} className={s.is_active ? "" : "muted"}><td className="nw">{it.name} <span className="small muted">/{it.unit}</span>{!s.is_active && <span className="tag">เลิกขาย</span>}</td>
              <td className="r"><Num value={edit[s.id]?.price ?? String(A(s.price))} onChange={(v) => setEdit({ ...edit, [s.id]: { ...edit[s.id], price: v } })} w="5em" /></td>
              <td className="r"><Num value={edit[s.id]?.vc ?? String(A(s.var_cost))} onChange={(v) => setEdit({ ...edit, [s.id]: { ...edit[s.id], vc: v } })} w="5em" /></td>
              <td className="nw">{edit[s.id] && <button className="link" onClick={() => saveRow(s)}>บันทึก</button>}
                <button className="link" onClick={() => toggle(s)}>{s.is_active ? "เลิกขาย" : "ขายต่อ"}</button>
                <button className="link red" onClick={() => remove(s, it)}>ลบ</button></td></tr>
          ))}</tbody></table></div>
        <p className="muted small">ค่าผันแปร = น้ำจิ้ม + ไม้เสียบ + ถุงใส่ของ ต่อหน่วยที่ขาย (ไม้ปิ้งตั้งไว้ 1.02 = 0.89 + 0.08 + 0.05)</p>
      </div>
      <div className="card">
        <h2>เพิ่มสินค้าซื้อมาขายต่อ</h2>
        <label>ชื่อ<input value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} placeholder="เช่น ถั่วลิสง" /></label>
        <div className="row">
          <label>หน่วย<input value={nw.unit} onChange={(e) => setNw({ ...nw, unit: e.target.value })} style={{ width: "5em" }} /></label>
          <label>ราคาขาย<Num value={nw.price} onChange={(v) => setNw({ ...nw, price: v })} w="6em" /></label>
        </div>
        <label className="chk"><input type="checkbox" checked={nw.carry} onChange={(e) => setNw({ ...nw, carry: e.target.checked })} /> ของเหลือเก็บไว้ขายวันถัดไป</label>
        <label className="chk"><input type="checkbox" checked={nw.both} onChange={(e) => setNw({ ...nw, both: e.target.checked })} /> ขายทั้งซันและเกด</label>
        <button onClick={add}>เพิ่มสินค้า</button>
      </div>
    </>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  const [date, setDate] = useState(() => initialDate(todayTH())), [ent, setEnt] = useState(() => initialParam("ent", ["GBS", "GBK"], "GBS")), [tab, setTab] = useState("move");
  const [day, setDay] = useState(null), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const reload = useCallback(async () => { try { setErr(""); setDay(await loadDay(date)); } catch (e) { setErr(e.message); } }, [date]);
  useEffect(() => { if (session) { setDay(null); reload(); } }, [session, date]);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(""), 4000); return () => clearTimeout(t); } }, [msg]);
  if (session === undefined) return <p className="muted pad">กำลังโหลด…</p>;
  if (!session) return <Login />;
  const TABS = [["move", "ย้ายของ"], ["sell", "ขาย"], ["exp", "รายจ่าย"], ["sum", "สรุป"], ["prod", "สินค้า"]];
  const p = { day, ent, reload, setMsg };
  return (
    <>
      <div className="testbar">หน้าทดสอบ — ข้อมูลที่ลงจะเข้าฐานข้อมูลจริง ลบทิ้งได้ก่อนเริ่มใช้จริง</div>
      <SiteNav current={ent.toLowerCase()} date={date} />
      
      <header>
        <h1>ลูกชิ้นปิ้ง</h1>
      </header>
      <div className="bar">
        <button className="ghost sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="ghost sm" onClick={() => setDate(addDays(date, 1))}>›</button>
        {tab !== "move" && <div className="seg">{Object.entries(SHOPS).map(([k, s]) => <button key={k} className={ent === k ? "on" : ""} onClick={() => setEnt(k)}>{s.name}</button>)}</div>}
      </div>
      <nav className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {msg && <div className="toast">{msg}</div>}
      {err && <p className="red pad">โหลดข้อมูลไม่ได้: {err}</p>}
      {!day ? <p className="muted pad">กำลังโหลด…</p> : (
        tab === "move" ? <MovesTab {...p} /> : tab === "sell" ? <SellTab {...p} /> : tab === "exp" ? <ExpenseTab {...p} />
          : tab === "sum" ? <SummaryTab {...p} /> : <ProductsTab {...p} />)}
      <p className="muted small pad">ผู้ใช้: {session.user.email} · <button className="link" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button></p>
    </>
  );
}

createRoot(document.getElementById("app")).render(<App />);
