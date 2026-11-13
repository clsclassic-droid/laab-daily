import "../shared/tokens.js";
// หน้า "คลังกลาง + ซื้อของ" (หน้าจริง ตั้งแต่ 13 พ.ย. 2569) — 4 เมนู: ภาพรวม · ซื้อของ · คลัง/เบิก · สินค้า
// ข้อมูล: inv_purchases (+ ซื้อเชื่อ inv_purchase_payments) · inv_moves (เบิก/คืน/ของเสีย from_loc/to_loc = 'main') · inv_items · inv_categories
// ภาพรวมต่อกิจการ = ฟังก์ชัน wh_overview (รวมสมุดบัญชีที่ฐานข้อมูล)
// ลงบัญชีอัตโนมัติที่ฐานข้อมูล (trigger wh_after_change → ใบบัญชี wh_purchase / wh_pay / wh_draw ผูก source_id)
// ดึงข้อมูลทั้งตารางเป็นช่วง ทีละ 1,000 แถว + นับเทียบ (Supabase ตัดเหลือ 1,000 แถวโดยไม่เตือน)
import SiteNav, { initialDate } from "../shared/site-nav.jsx";
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../supabaseClient.js";

const LOCS = [["main", "คลังกลาง (ใช้ร่วม)"], ["ls", "ร้านลาบ"], ["factory", "โรงลูกชิ้น"], ["gbs", "ซัน"], ["gbk", "เกด"], ["ns", "ร้านก๋วยเตี๋ยว"]];
const LOC_NAME = Object.fromEntries(LOCS.map(([k, v]) => [k, v.replace(" (ใช้ร่วม)", "")]));
const DRAW_TO = [...LOCS.filter(([k]) => k !== "main"), ["waste", "ของเสีย (ทิ้ง)"]];
const FLOW_COLS = [["ls", "ร้านลาบ"], ["factory", "โรงลูกชิ้น"], ["gbs", "ซัน"], ["gbk", "เกด"], ["ns", "ก๋วยเตี๋ยว"], ["waste", "เสีย"]];
const ENTS = [["LS", "ร้านลาบ"], ["FT", "โรงลูกชิ้น"], ["GBS", "ซัน"], ["GBK", "เกด"], ["NS", "ร้านก๋วยเตี๋ยว"]];
const ENT_NAME = Object.fromEntries(ENTS);
const PAY_FROM = [["pool", "กองกลาง"], ["drawer", "ลิ้นชักร้าน"], ["transfer", "โอน"]];
const PAID = [...PAY_FROM, ["credit", "ซื้อเชื่อ (จ่ายทีหลัง)"]];
const PAID_NAME = { ...Object.fromEntries(PAY_FROM), credit: "ซื้อเชื่อ" };
const noEnt = (pf) => pf === "pool" || pf === "credit"; // กองกลาง/ซื้อเชื่อ ไม่ระบุร้านที่จ่าย
const LOC_ENT = { ls: "LS", factory: "FT", gbs: "GBS", gbk: "GBK", ns: "NS" };

const A = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n, d = 0) => (n == null ? "" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: 2 }));
const todayTH = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const chk = ({ data, error }) => { if (error) throw error; return data; };
// ข้อความ error ภาษาคน — error จากคำขอนับแถว (HEAD) ไม่มีข้อความ เช่น ล็อกอินหมดอายุ
const errText = (e) => {
  const m = String(e?.message || e?.details || e?.hint || (typeof e === "string" ? e : "")).replace(/^.*?ERROR:\s*/, "").trim();
  return m || "เชื่อมต่อฐานข้อมูลไม่สำเร็จ (ล็อกอินอาจหมดอายุ) — กดรีเฟรชหน้านี้";
};
const monthStart = (d) => d.slice(0, 8) + "01";
const monthEnd = (d) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const ENT_ORDER = [["LS", "ร้านลาบ"], ["FT", "โรงลูกชิ้น"], ["GBS", "ลูกชิ้นปิ้ง ซัน"], ["GBK", "ลูกชิ้นปิ้ง เกด"], ["NS", "ร้านก๋วยเตี๋ยว"]];

/* ดึงทุกแถวทีละ 1,000 แล้วนับเทียบกับจำนวนจริง (ไม่ตรง = error) · q() สร้างคำค้นใหม่ทุกครั้ง */
async function fetchAll(table, cols, filter = (q) => q, order = "id") {
  const { count, error: ce } = await filter(supabase.from(table).select(cols, { count: "exact", head: true }));
  if (ce) throw ce;
  if (typeof count !== "number") throw new Error(`นับแถว ${table} ไม่ได้`);
  const out = [];
  for (let from = 0; from < count; from += 1000) {
    out.push(...chk(await filter(supabase.from(table).select(cols)).order(order).range(from, from + 999)));
  }
  if (out.length !== count) throw new Error(`ดึงข้อมูล ${table} ไม่ครบ (${out.length}/${count}) ลองโหลดใหม่`);
  return out;
}
/* สต๊อกคลังกลางทุกสินค้า (ฟังก์ชัน inv_main_stock) ดึงทีละ 1,000 จนหมด */
async function fetchStock() {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = chk(await supabase.rpc("inv_main_stock").order("item_id").range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/* สต๊อกทุกที่ ณ วันที่ (ฟังก์ชัน inv_loc_stock) ดึงทีละ 1,000 จนหมด */
async function fetchLocStock(date) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = chk(await supabase.rpc("inv_loc_stock", { p_date: date }).order("item_id").order("location").range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

async function loadAll(date) {
  const [items, cats, purchases, monthMoves, stock, credits, payments, bills, billLines, locStock] = await Promise.all([
    fetchAll("inv_items", "*"),
    fetchAll("inv_categories", "*", (q) => q, "name"),
    fetchAll("inv_purchases", "*", (q) => q.eq("purchase_date", date)),
    // เบิก/คืน/ของเสียของคลังกลางทั้งเดือน (ตารางสต๊อก) — วันนี้กรองจากชุดนี้
    fetchAll("inv_moves", "*", (q) => q.gte("move_date", monthStart(date)).lte("move_date", monthEnd(date)).or("from_loc.eq.main,to_loc.eq.main")),
    fetchStock(),
    fetchAll("inv_purchases", "*", (q) => q.eq("paid_from", "credit")),   // ซื้อเชื่อทุกวัน (ยอดค้าง)
    fetchAll("inv_purchase_payments", "*"),
    fetchAll("inv_bills", "*"),                                                       // บิลยอดเงินก่อน
    fetchAll("inv_purchases", "id,bill_id,amount", (q) => q.not("bill_id", "is", null)), // รายการที่ใส่ในบิลแล้ว
    fetchLocStock(date),
  ]);
  const billSum = {};
  for (const l of billLines) billSum[l.bill_id] = r2((billSum[l.bill_id] || 0) + A(l.amount));
  cats.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const moves = monthMoves.filter((m) => m.move_date === date);
  const paidBy = {};
  for (const y of payments) paidBy[y.purchase_id] = r2((paidBy[y.purchase_id] || 0) + A(y.amount));
  items.sort((a, b) => (a.category || "").localeCompare(b.category || "", "th") || a.name.localeCompare(b.name, "th"));
  return { date, items, cats: cats.filter((c) => c.is_active), purchases, moves, monthMoves, stock, credits, payments, paidBy, bills, billSum, locStock,
    itemById: Object.fromEntries(items.map((i) => [i.id, i])), stockById: Object.fromEntries(stock.map((s) => [s.item_id, s])) };
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
      <h1>คลังกลาง</h1>
      <label>อีเมล<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label>รหัสผ่าน<input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
      {err && <p className="red">{err}</p>}
      <button disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
    </form>
  );
}

const Num = ({ value, onChange, ph, w }) => (
  <input className="num" inputMode="decimal" placeholder={ph || ""} style={w ? { width: w } : null}
    value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))} />
);

/* ── เมนูซื้อของ ── */
const EMPTY = { id: null, name: "", cat: "", unit: "", tier2: false, qty: "", price: "", total: "", last: "total",
  forLoc: "main", paidFrom: "pool", paidEnt: "LS", inv: false, vendor: "", note: "", paidNow: "", nowFrom: "pool", nowEnt: "LS", billId: null, origAmt: 0 };
const billLeft = (data, b) => r2(A(b.amount) - (data.billSum[b.id] || 0));
const dm = (d) => `${d.slice(8)}/${d.slice(5, 7)}`;

function BuyTab({ data, reload, setMsg, billId, setBillId, setDate }) {
  const [f, setF] = useState(EMPTY), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  // เลือกบิลที่จะใส่สินค้า → ใส่ร้านที่ซื้อ/จ่ายจาก/ใบกำกับ ตามบิลให้
  useEffect(() => {
    const b = billId && data.bills.find((x) => x.id === billId);
    if (b) setF({ ...EMPTY, billId, vendor: b.vendor_name || "", paidFrom: b.paid_from, paidEnt: b.paid_entity || "LS", inv: b.has_tax_invoice });
  }, [billId]);
  const bill = f.billId ? data.bills.find((x) => x.id === f.billId) : null;
  const left = bill ? r2(billLeft(data, bill) + A(f.origAmt)) : 0;   // แก้รายการเดิมในบิล = คืนยอดเดิมก่อน
  const startBill = (b) => { setErr(""); setBillId(b.id); if (b.bill_date !== data.date) setDate(b.bill_date); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const endBill = () => { setBillId(null); setF(EMPTY); };
  const known = data.items.find((i) => i.name === f.name.trim());
  // พิมพ์ชื่อสินค้าที่มีอยู่ → ใส่หมวด/หน่วยให้
  const onName = (v) => {
    const it = data.items.find((i) => i.name === v.trim());
    setF((x) => ({ ...x, name: v, ...(it ? { cat: it.category || "", unit: it.unit || "", tier2: it.tier === 2 } : {}) }));
  };
  // ใส่ราคาต่อหน่วยหรือราคารวมก็ได้ อีกช่องคำนวณให้
  const qty = A(f.qty);
  const total = f.last === "price" ? r2(qty * A(f.price)) : A(f.total);
  const price = f.last === "price" ? A(f.price) : qty ? r2(A(f.total) / qty) : 0;
  const vat = f.inv ? r2(total * 7 / 107) : 0;
  const forEnt = LOC_ENT[f.forLoc];

  const save = async () => {
    setErr("");
    const name = f.name.trim();
    if (!name) return setErr("ใส่ชื่อรายการ");
    if (!(qty > 0)) return setErr("ใส่จำนวน");
    if (!(total >= 0)) return setErr("ใส่ราคา");
    if (!known && !f.cat) return setErr("สินค้าใหม่ ต้องเลือกหมวด");
    if (!known && !f.unit.trim()) return setErr("สินค้าใหม่ ต้องใส่หน่วย");
    if (bill && total > left + 0.004) return setErr(`เกินยอดบิล — บิลนี้เหลือให้ใส่อีก ${fmt(left, 2)} บาท`);
    setBusy(true);
    try {
      let itemId = known?.id;
      if (!itemId) {
        itemId = chk(await supabase.from("inv_items").insert({ name, unit: f.unit.trim(), category: f.cat, tier: f.tier2 ? 2 : 1 })
          .select("id").single()).id;
      }
      const row = { purchase_date: bill ? bill.bill_date : data.date, item_id: itemId, qty, unit_price: price, amount: total, has_tax_invoice: f.inv,
        for_loc: f.forLoc, paid_from: f.paidFrom, paid_entity: noEnt(f.paidFrom) ? null : f.paidEnt,
        vendor_name: f.vendor.trim() || null, note: f.note.trim() || null, bill_id: f.billId || null };
      const now = f.paidFrom === "credit" && !f.id && !bill ? A(f.paidNow) : 0;
      if (now > total) throw new Error("จ่ายไปแล้วมากกว่ายอดซื้อ");
      if (f.id) chk(await supabase.from("inv_purchases").update(row).eq("id", f.id));
      else {
        const id = chk(await supabase.from("inv_purchases").insert(row).select("id").single()).id;
        // ซื้อเชื่อแต่จ่ายบางส่วนตอนซื้อ → บันทึกการจ่ายวันเดียวกัน
        if (now > 0) chk(await supabase.from("inv_purchase_payments").insert({ purchase_id: id, pay_date: data.date, amount: now,
          paid_from: f.nowFrom, paid_entity: f.nowFrom === "pool" ? null : f.nowEnt, note: "จ่ายตอนซื้อ" }));
      }
      const done = bill && r2(left - total) <= 0.004;
      setMsg(done ? "บิลครบยอดแล้ว" : f.id ? "แก้รายการแล้ว" : "บันทึกแล้ว");
      if (done) { setBillId(null); setF(EMPTY); }
      else setF({ ...EMPTY, cat: f.cat, forLoc: f.forLoc, paidFrom: f.paidFrom, paidEnt: f.paidEnt, vendor: f.vendor, inv: bill ? f.inv : false,
        nowFrom: f.nowFrom, nowEnt: f.nowEnt, billId: f.billId });
      await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const edit = (p) => {
    const it = data.itemById[p.item_id] || {};
    setF({ id: p.id, name: it.name || "", cat: it.category || "", unit: it.unit || "", tier2: it.tier === 2, qty: String(p.qty),
      price: String(p.unit_price ?? ""), total: String(p.amount), last: "total", forLoc: p.for_loc, paidFrom: p.paid_from,
      paidEnt: p.paid_entity || "LS", inv: p.has_tax_invoice, vendor: p.vendor_name || "", note: p.note || "", paidNow: "", nowFrom: "pool", nowEnt: "LS",
      billId: p.bill_id || null, origAmt: p.bill_id ? A(p.amount) : 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const del = async (p) => {
    const it = data.itemById[p.item_id];
    if (!window.confirm(`ลบ "${it?.name}" ${fmt(p.qty)} ${it?.unit || ""} ${fmt(p.amount, 2)} บาท ?`)) return;
    try { chk(await supabase.from("inv_purchases").delete().eq("id", p.id)); setMsg("ลบแล้ว"); await reload(); }
    catch (e) { window.alert(errText(e)); }
  };

  const rows = [...data.purchases].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sum = rows.reduce((t, p) => t + A(p.amount), 0), sumVat = rows.reduce((t, p) => t + A(p.vat_amount), 0);
  return (
    <>
      <BillCard data={data} reload={reload} setMsg={setMsg} startBill={startBill} activeId={f.billId} />
      <div className="card" style={bill ? { outline: "2px solid var(--accent, #2563eb)" } : null}>
        <h2>{f.id ? "แก้รายการซื้อ" : bill ? "ใส่สินค้าในบิล" : "ลงของที่ซื้อ"}</h2>
        {bill && <p className="warn small">บิล {dm(bill.bill_date)}{bill.vendor_name ? " · " + bill.vendor_name : ""} ยอด <b>{fmt(bill.amount, 2)}</b> บาท
          · เหลือให้ใส่อีก <b>{fmt(left, 2)}</b> บาท{total ? <> → หลังบันทึกเหลือ <b>{fmt(r2(left - total), 2)}</b></> : null}
          <button className="link" onClick={endBill}>เลิกใส่บิลนี้</button></p>}
        <div className="row">
          {/* บอสหนึ่ง 13 พ.ย.: หมวดมาก่อนรายการ · เลือกหมวดแล้ว รายชื่อสินค้าที่เด้งขึ้นจะเหลือเฉพาะหมวดนั้น */}
          <label style={{ flex: "1 1 230px" }}>หมวด
            <select value={f.cat} disabled={!!known} onChange={(e) => set("cat", e.target.value)} style={{ width: "100%" }}>
              <option value="">— เลือกหมวด —</option>
              {data.cats.map((c) => <option key={c.name}>{c.name}</option>)}
              {f.cat && !data.cats.some((c) => c.name === f.cat) && <option>{f.cat}</option>}
            </select>
          </label>
          <label style={{ flex: "1 1 220px" }}>รายการ
            <input list="items" value={f.name} onChange={(e) => onName(e.target.value)} placeholder="พิมพ์ชื่อ (ชื่อใหม่ = เพิ่มสินค้าใหม่)" style={{ width: "100%" }} />
          </label>
          <datalist id="items">{data.items.filter((i) => i.is_active && (!f.cat || known || i.category === f.cat)).map((i) => <option key={i.id} value={i.name} />)}</datalist>
          <label>หน่วย<input value={f.unit} disabled={!!known} onChange={(e) => set("unit", e.target.value)} style={{ width: "6em" }} /></label>
        </div>
        {f.name.trim() && !known && <p className="warn small">สินค้าใหม่ — จะเพิ่มเข้ารายการสินค้าตอนบันทึก
          <label className="chk" style={{ margin: "6px 0 0" }}><input type="checkbox" checked={f.tier2} onChange={(e) => set("tier2", e.target.checked)} /> นับสิ้นเดือน (ของเล็ก ไม่ต้องเบิกทุกครั้ง)</label></p>}
        <div className="row">
          <label>จำนวน<Num value={f.qty} onChange={(v) => set("qty", v)} w="6em" /></label>
          <label>ราคา/หน่วย<Num value={f.last === "price" ? f.price : price ? String(price) : ""} onChange={(v) => setF((x) => ({ ...x, price: v, last: "price" }))} /></label>
          <label>ราคารวม<Num value={f.last === "total" ? f.total : total ? String(total) : ""} onChange={(v) => setF((x) => ({ ...x, total: v, last: "total" }))} /></label>
        </div>
        <div className="row">
          <label>สำหรับ
            <select value={f.forLoc} onChange={(e) => set("forLoc", e.target.value)}>{LOCS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label>จ่ายจาก
            <select value={f.paidFrom} disabled={!!bill} onChange={(e) => set("paidFrom", e.target.value)}>{PAID.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          {!noEnt(f.paidFrom) && <label>ของร้าน
            <select value={f.paidEnt} disabled={!!bill} onChange={(e) => set("paidEnt", e.target.value)}>{ENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>}
          <label className="chk" style={{ paddingBottom: 12 }}><input type="checkbox" checked={f.inv} disabled={!!bill} onChange={(e) => set("inv", e.target.checked)} /> มีใบกำกับภาษี</label>
        </div>
        {f.paidFrom === "credit" && !f.id && !bill && <div className="row">
          <label>จ่ายไปแล้วตอนซื้อ (บาท)<Num value={f.paidNow} onChange={(v) => set("paidNow", v)} ph="0 = ยังไม่จ่าย" w="8em" /></label>
          {A(f.paidNow) > 0 && <label>จ่ายจาก<select value={f.nowFrom} onChange={(e) => set("nowFrom", e.target.value)}>{PAY_FROM.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          {A(f.paidNow) > 0 && f.nowFrom !== "pool" && <label>ของร้าน<select value={f.nowEnt} onChange={(e) => set("nowEnt", e.target.value)}>{ENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
        </div>}
        {f.paidFrom === "credit" && <p className="small muted">ซื้อเชื่อ: ยอดที่ยังไม่จ่ายขึ้นใน "หนี้ค่าของค้างจ่าย" ด้านล่าง กดจ่ายเมื่อจ่ายจริง{total && !f.id ? <> · ค้าง <b>{fmt(r2(total - A(f.paidNow)), 2)}</b> บาท</> : null}</p>}
        <div className="row">
          <label style={{ flex: "1 1 160px" }}>ร้านที่ซื้อ<input value={f.vendor} disabled={!!bill} onChange={(e) => set("vendor", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 160px" }}>หมายเหตุ<input value={f.note} onChange={(e) => set("note", e.target.value)} style={{ width: "100%" }} /></label>
        </div>
        <p className="small muted">
          {total ? <>รวม <b>{fmt(total, 2)}</b> บาท{vat ? <> · VAT ซื้อ {fmt(vat, 2)}</> : null} · </> : null}
          {f.forLoc === "main" ? "เข้าสต๊อกคลังกลาง แล้วร้านกดเบิก" : `เป็นต้นทุนของ${LOC_NAME[f.forLoc]}ทันที`}
        </p>
        {err && <p className="red">{err}</p>}
        <div className="row">
          <button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : f.id ? "บันทึกที่แก้" : "บันทึก"}</button>
          {f.id && <button className="ghost" onClick={endBill}>ยกเลิกแก้</button>}
        </div>
      </div>

      <div className="card">
        <h2>ของที่ซื้อวันนี้ ({rows.length} รายการ)</h2>
        {!rows.length ? <p className="muted">ยังไม่มีรายการ</p> : (
          <div className="scroll"><table className="grid">
            <thead><tr><th>รายการ</th><th>จำนวน</th><th>รวม</th><th>สำหรับ</th><th>จ่ายจาก</th><th></th></tr></thead>
            <tbody>{rows.map((p) => {
              const it = data.itemById[p.item_id] || {};
              return (
                <tr key={p.id} style={f.id === p.id ? { background: "var(--warn)" } : null}>
                  <td>{it.name}<div className="small muted">{it.category}{p.vendor_name ? " · " + p.vendor_name : ""}{p.has_tax_invoice ? " · ใบกำกับ" : ""}{p.note ? " · " + p.note : ""}</div>{p.bill_id && <span className="tag">ในบิล</span>}</td>
                  <td className="r">{fmt(p.qty)} {it.unit}</td>
                  <td className="r">{fmt(p.amount, 2)}{A(p.vat_amount) ? <div className="small muted">VAT {fmt(p.vat_amount, 2)}</div> : null}</td>
                  <td className="nw">{LOC_NAME[p.for_loc]}</td>
                  <td className="nw">{PAID_NAME[p.paid_from]}{p.paid_entity && !noEnt(p.paid_from) ? " " + ENT_NAME[p.paid_entity] : ""}
                    {p.paid_from === "credit" && <div className="small muted">ค้าง {fmt(r2(A(p.amount) - (data.paidBy[p.id] || 0)), 2)}</div>}</td>
                  <td className="nw"><button className="link" onClick={() => edit(p)}>แก้</button><button className="link red" onClick={() => del(p)}>ลบ</button></td>
                </tr>);
            })}</tbody>
            <tfoot><tr><td>รวม</td><td></td><td className="r">{fmt(sum, 2)}{sumVat ? <div className="small">VAT {fmt(sumVat, 2)}</div> : null}</td><td colSpan={3}></td></tr></tfoot>
          </table></div>)}
      </div>
      <DebtCard data={data} reload={reload} setMsg={setMsg} />
    </>
  );
}

/* ── บิลยอดเงินก่อน รายละเอียดสินค้าทีหลัง (แบบ ก: บิลไม่ลงบัญชีเอง ลงตามรายการที่ใส่) ── */
const BILL0 = { id: null, amt: "", vendor: "", from: "pool", ent: "LS", inv: false, note: "" };
function BillCard({ data, reload, setMsg, startBill, activeId }) {
  const [b, setB] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const rows = data.bills.map((x) => ({ x, left: billLeft(data, x) }));
  const open = rows.filter((r) => r.left > 0.004 || r.left < -0.004).sort((a, c) => a.x.bill_date.localeCompare(c.x.bill_date));
  const doneToday = rows.filter((r) => Math.abs(r.left) <= 0.004 && r.x.bill_date === data.date);
  const save = async () => {
    setErr("");
    const amt = A(b.amt);
    if (!(amt > 0)) return setErr("ใส่ยอดเงินในบิล");
    if (b.id && amt + 0.004 < (data.billSum[b.id] || 0)) return setErr(`ยอดบิลต่ำกว่าสินค้าที่ใส่ไปแล้ว (${fmt(data.billSum[b.id], 2)})`);
    setBusy(true);
    try {
      const row = { amount: amt, vendor_name: b.vendor.trim() || null, paid_from: b.from, paid_entity: noEnt(b.from) ? null : b.ent,
        has_tax_invoice: b.inv, note: b.note.trim() || null };
      if (b.id) {
        if (data.billSum[b.id]) { const o = data.bills.find((x) => x.id === b.id);   // มีสินค้าแล้ว: เปลี่ยนได้แค่ยอดกับหมายเหตุ
          Object.assign(row, { vendor_name: o.vendor_name, paid_from: o.paid_from, paid_entity: o.paid_entity, has_tax_invoice: o.has_tax_invoice }); }
        chk(await supabase.from("inv_bills").update({ ...row, updated_at: new Date().toISOString() }).eq("id", b.id));
      } else chk(await supabase.from("inv_bills").insert({ ...row, bill_date: data.date }));
      setB(null); setMsg(b.id ? "แก้บิลแล้ว" : "ลงบิลแล้ว — กด \"ใส่สินค้า\" เมื่อพร้อม"); await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const del = async (x) => {
    const n = data.billSum[x.id] ? " (สินค้าที่ใส่ไปแล้วยังอยู่ แค่ไม่ผูกกับบิล)" : "";
    if (!window.confirm(`ลบบิล ${dm(x.bill_date)} ${x.vendor_name || ""} ${fmt(x.amount, 2)} บาท ?${n}`)) return;
    try { chk(await supabase.from("inv_bills").delete().eq("id", x.id)); setMsg("ลบบิลแล้ว"); await reload(); }
    catch (e) { window.alert(errText(e)); }
  };
  const edit = (x) => { setErr(""); setB({ id: x.id, amt: String(x.amount), vendor: x.vendor_name || "", from: x.paid_from, ent: x.paid_entity || "LS", inv: x.has_tax_invoice, note: x.note || "" }); };
  const locked = b?.id && data.billSum[b.id];
  const Row = ({ x, left }) => (
    <tr style={activeId === x.id ? { background: "var(--warn)" } : null}>
      <td className="nw">{dm(x.bill_date)}</td>
      <td>{x.vendor_name || "—"}<div className="small muted">{PAID_NAME[x.paid_from]}{x.paid_entity ? " " + ENT_NAME[x.paid_entity] : ""}{x.has_tax_invoice ? " · ใบกำกับ" : ""}{x.note ? " · " + x.note : ""}</div></td>
      <td className="r">{fmt(x.amount, 2)}</td>
      <td className={"r b" + (left > 0.004 ? " red" : left < -0.004 ? " red" : "")}>{Math.abs(left) <= 0.004 ? "ครบ" : left < 0 ? "เกิน " + fmt(-left, 2) : fmt(left, 2)}</td>
      <td className="nw">{left > 0.004 && <button className="link" onClick={() => startBill(x)}>ใส่สินค้า</button>}
        <button className="link" onClick={() => edit(x)}>แก้</button><button className="link red" onClick={() => del(x)}>ลบ</button></td>
    </tr>);
  return (
    <div className="card">
      <div className="bar"><h2 style={{ margin: 0 }}>บิลรอใส่รายละเอียด {open.length ? <span className="tag">{open.length} บิล</span> : null}</h2>
        {!b && <button className="sm" style={{ marginLeft: "auto" }} onClick={() => { setErr(""); setB({ ...BILL0 }); }}>+ ลงบิล (ยอดเงินก่อน)</button>}</div>
      {b && <div style={{ background: "var(--warn)", padding: 8, borderRadius: "var(--r-input)", margin: "8px 0" }}>
        <div className="row">
          <label>ยอดเงินในบิล (บาท)<Num value={b.amt} onChange={(v) => setB({ ...b, amt: v })} w="8em" /></label>
          <label style={{ flex: "1 1 140px" }}>ร้านที่ซื้อ<input value={b.vendor} disabled={locked} onChange={(e) => setB({ ...b, vendor: e.target.value })} style={{ width: "100%" }} /></label>
        </div>
        <div className="row">
          <label>จ่ายจาก<select value={b.from} disabled={locked} onChange={(e) => setB({ ...b, from: e.target.value })}>{PAID.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {!noEnt(b.from) && <label>ของร้าน<select value={b.ent} disabled={locked} onChange={(e) => setB({ ...b, ent: e.target.value })}>{ENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
          <label className="chk" style={{ paddingBottom: 12 }}><input type="checkbox" checked={b.inv} disabled={locked} onChange={(e) => setB({ ...b, inv: e.target.checked })} /> มีใบกำกับภาษี</label>
          <label style={{ flex: "1 1 120px" }}>หมายเหตุ<input value={b.note} onChange={(e) => setB({ ...b, note: e.target.value })} style={{ width: "100%" }} /></label>
        </div>
        <p className="small muted">{b.id ? "" : `บิลลงวันที่ ${dm(data.date)} · `}ยังไม่ลงบัญชีจนกว่าจะใส่สินค้า (เงินออกจากลิ้นชักจะขึ้นหน้าร้านตอนใส่สินค้า){locked ? " · บิลนี้มีสินค้าแล้ว แก้ได้แค่ยอดและหมายเหตุ" : ""}</p>
        {err && <p className="red">{err}</p>}
        <div className="row"><button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : b.id ? "บันทึกที่แก้" : "บันทึกบิล"}</button><button className="ghost" onClick={() => setB(null)}>ยกเลิก</button></div>
      </div>}
      {!open.length && !doneToday.length ? <p className="muted small">ไม่มีบิลค้าง · ใช้เมื่อซื้อหลายอย่างแต่ยังไม่มีเวลาลงทีละรายการ</p> : (
        <div className="scroll"><table className="grid">
          <thead><tr><th>วันที่</th><th>ร้านที่ซื้อ</th><th>ยอดบิล</th><th>ยังขาด</th><th></th></tr></thead>
          <tbody>{open.map((r) => <Row key={r.x.id} {...r} />)}{doneToday.map((r) => <Row key={r.x.id} {...r} />)}</tbody>
        </table></div>)}
    </div>
  );
}

/* ── หนี้ค่าของค้างจ่าย (ซื้อเชื่อ) — ทุกวันที่ · จ่ายลงวันที่ที่เลือกบนหน้า ── */
function DebtCard({ data, reload, setMsg }) {
  const [pay, setPay] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const open = data.credits.map((p) => ({ p, it: data.itemById[p.item_id] || {}, left: r2(A(p.amount) - (data.paidBy[p.id] || 0)) }))
    .filter((x) => x.left > 0.004).sort((a, b) => a.p.purchase_date.localeCompare(b.p.purchase_date));
  const total = r2(open.reduce((t, x) => t + x.left, 0));
  const today = data.payments.filter((y) => y.pay_date === data.date).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const save = async () => {
    setErr("");
    const amt = A(pay.amt), x = open.find((o) => o.p.id === pay.id);
    if (!(amt > 0)) return setErr("ใส่จำนวนเงิน");
    if (x && amt > x.left + 0.004) return setErr(`เกินยอดค้าง (${fmt(x.left, 2)})`);
    setBusy(true);
    try {
      chk(await supabase.from("inv_purchase_payments").insert({ purchase_id: pay.id, pay_date: data.date, amount: amt,
        paid_from: pay.from, paid_entity: pay.from === "pool" ? null : pay.ent, note: pay.note.trim() || null }));
      setPay(null); setMsg("บันทึกจ่ายหนี้แล้ว"); await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const del = async (y) => {
    const p = data.credits.find((c) => c.id === y.purchase_id), it = data.itemById[p?.item_id];
    if (!window.confirm(`ลบการจ่ายหนี้ "${it?.name || ""}" ${fmt(y.amount, 2)} บาท ? (ยอดจะกลับไปค้าง)`)) return;
    try { chk(await supabase.from("inv_purchase_payments").delete().eq("id", y.id)); setMsg("ลบแล้ว"); await reload(); }
    catch (e) { window.alert(errText(e)); }
  };
  if (!open.length && !today.length) return null;
  return (
    <div className="card">
      <h2>หนี้ค่าของค้างจ่าย {total ? <span className="tag">รวม {fmt(total, 2)} บาท</span> : null}</h2>
      {!open.length ? <p className="muted">ไม่มียอดค้าง</p> : (
        <div className="scroll"><table className="grid">
          <thead><tr><th>วันที่ซื้อ</th><th>รายการ</th><th>ยอดซื้อ</th><th>ค้าง</th><th></th></tr></thead>
          <tbody>{open.map(({ p, it, left }) => (
            <React.Fragment key={p.id}>
              <tr><td className="nw">{p.purchase_date.slice(8)}/{p.purchase_date.slice(5, 7)}</td>
                <td>{it.name} {fmt(p.qty)} {it.unit}<div className="small muted">{LOC_NAME[p.for_loc]}{p.vendor_name ? " · " + p.vendor_name : ""}</div></td>
                <td className="r">{fmt(p.amount, 2)}</td><td className="r b red">{fmt(left, 2)}</td>
                <td><button className="link" onClick={() => { setErr(""); setPay({ id: p.id, amt: String(left), from: "pool", ent: LOC_ENT[p.for_loc] || "LS", note: "" }); }}>จ่าย</button></td></tr>
              {pay?.id === p.id && <tr><td colSpan={5} style={{ background: "var(--warn)" }}>
                <div className="row">
                  <label>จ่ายวันที่ {data.date.slice(8)}/{data.date.slice(5, 7)} (บาท)<Num value={pay.amt} onChange={(v) => setPay({ ...pay, amt: v })} w="7em" /></label>
                  <label>จ่ายจาก<select value={pay.from} onChange={(e) => setPay({ ...pay, from: e.target.value })}>{PAY_FROM.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                  {pay.from !== "pool" && <label>ของร้าน<select value={pay.ent} onChange={(e) => setPay({ ...pay, ent: e.target.value })}>{ENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>}
                  <label style={{ flex: "1 1 120px" }}>หมายเหตุ<input value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} style={{ width: "100%" }} /></label>
                </div>
                {err && <p className="red">{err}</p>}
                <div className="row"><button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : "บันทึกจ่าย"}</button><button className="ghost" onClick={() => setPay(null)}>ยกเลิก</button></div>
              </td></tr>}
            </React.Fragment>))}</tbody>
        </table></div>)}
      {today.length > 0 && <>
        <h3>จ่ายหนี้วันนี้</h3>
        <table className="grid"><tbody>{today.map((y) => { const p = data.credits.find((c) => c.id === y.purchase_id) || {}, it = data.itemById[p.item_id] || {};
          return <tr key={y.id}><td>{it.name}<div className="small muted">ซื้อ {p.purchase_date?.slice(8)}/{p.purchase_date?.slice(5, 7)}{y.note ? " · " + y.note : ""}</div></td>
            <td className="r">{fmt(y.amount, 2)}</td><td className="nw">{PAID_NAME[y.paid_from]}{y.paid_entity ? " " + ENT_NAME[y.paid_entity] : ""}</td>
            <td><button className="link red" onClick={() => del(y)}>ลบ</button></td></tr>; })}</tbody></table>
      </>}
      <p className="small muted">จ่ายจากลิ้นชัก/บัญชีร้าน = ลงบัญชีเงินออกจากร้านนั้นให้อัตโนมัติ (ขึ้นในหน้าร้านแบบดูอย่างเดียว) · กองกลางจ่าย = ไม่ลงบัญชีร้าน</p>
    </div>
  );
}

/* ── เมนูคลัง/เบิก ── */
function StockTab({ data, reload, setMsg }) {
  const [to, setTo] = useState("ls"), [itemId, setItemId] = useState(""), [qty, setQty] = useState(""), [note, setNote] = useState("");
  const [editId, setEditId] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState(""), [all, setAll] = useState(false);
  const stockRows = data.items.map((i) => ({ it: i, s: data.stockById[i.id] })).filter(({ s }) => s && (all || A(s.qty) !== 0));
  const inStock = stockRows.filter(({ s }) => A(s.qty) > 0);
  const totalVal = stockRows.reduce((t, { s }) => t + A(s.value), 0);
  const cur = data.stockById[itemId];

  const save = async () => {
    setErr("");
    if (!itemId) return setErr("เลือกสินค้า");
    if (!(A(qty) > 0)) return setErr("ใส่จำนวน");
    setBusy(true);
    try {
      const waste = to === "waste";
      const row = { move_date: data.date, kind: waste ? "waste" : "draw", item_id: itemId, qty: A(qty), from_loc: "main", to_loc: waste ? null : to, source: "wh", note: note.trim() || null };
      if (editId) chk(await supabase.from("inv_moves").update(row).eq("id", editId));
      else chk(await supabase.from("inv_moves").insert(row));
      setMsg(editId ? "แก้แล้ว" : to === "waste" ? "บันทึกของเสียแล้ว" : "เบิกแล้ว");
      setEditId(null); setQty(""); setNote(""); setItemId("");
      await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const edit = (m) => { setEditId(m.id); setItemId(m.item_id); setQty(String(m.qty)); setTo(m.kind === "waste" ? "waste" : m.to_loc); setNote(m.note || ""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const del = async (m) => {
    const it = data.itemById[m.item_id];
    if (!window.confirm(`ลบ${m.kind === "waste" ? "ของเสีย" : "การเบิก"} "${it?.name}" ${fmt(m.qty)} ${it?.unit || ""}${m.to_loc ? " ไป" + (LOC_NAME[m.to_loc] || "") : ""} ? (ของจะกลับเข้าคลัง)`)) return;
    try { chk(await supabase.from("inv_moves").delete().eq("id", m.id)); setMsg("ลบแล้ว"); await reload(); }
    catch (e) { window.alert(errText(e)); }
  };
  const draws = [...data.moves].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      <div className="card">
        <h2>{editId ? "แก้การเบิก" : to === "waste" ? "บันทึกของเสียในคลังกลาง" : "เบิกของจากคลังกลาง"}</h2>
        <div className="row">
          <label>เบิกไป<select value={to} onChange={(e) => setTo(e.target.value)}>{DRAW_TO.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label style={{ flex: "1 1 200px" }}>สินค้า
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={{ width: "100%" }}>
              <option value="">— เลือก —</option>
              {inStock.map(({ it, s }) => <option key={it.id} value={it.id}>{it.name} (เหลือ {fmt(s.qty)} {it.unit})</option>)}
              {editId && !inStock.some(({ it }) => it.id === itemId) && <option value={itemId}>{data.itemById[itemId]?.name}</option>}
            </select>
          </label>
          <label>จำนวน<Num value={qty} onChange={setQty} w="6em" /></label>
          <label style={{ flex: "1 1 140px" }}>หมายเหตุ<input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} /></label>
        </div>
        {cur && A(qty) > 0 && <p className="small muted">ต้นทุนประมาณ {fmt(r2(A(qty) * A(cur.avg_cost)), 2)} บาท (ราคาเฉลี่ย {fmt(cur.avg_cost, 2)}/{data.itemById[itemId]?.unit} ไม่รวม VAT) → ต้นทุนของ{LOC_NAME[to]}</p>}
        {to === "waste" && <p className="small muted">ของเสีย: ตัดออกจากสต๊อกคลังกลาง ไม่เป็นต้นทุนของร้านไหน (เป็นเงินกองกลางที่เสียไป) · ถ้านับแล้วของขาด ใช้ช่องนี้ใส่หมายเหตุ "นับขาด" ได้</p>}
        {err && <p className="red">{err}</p>}
        <div className="row">
          <button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : editId ? "บันทึกที่แก้" : to === "waste" ? "บันทึกของเสีย" : "เบิก"}</button>
          {editId && <button className="ghost" onClick={() => { setEditId(null); setQty(""); setItemId(""); setNote(""); }}>ยกเลิกแก้</button>}
        </div>
      </div>

      <div className="card">
        <h2>เบิก / ของเสีย วันนี้ ({draws.length} รายการ)</h2>
        {!draws.length ? <p className="muted">ยังไม่มีการเบิก</p> : (
          <div className="scroll"><table className="grid">
            <thead><tr><th>สินค้า</th><th>จำนวน</th><th>ไป</th><th>ต้นทุน</th><th></th></tr></thead>
            <tbody>{draws.map((m) => {
              const it = data.itemById[m.item_id] || {}, out = m.from_loc === "main";
              return (
                <tr key={m.id} style={editId === m.id ? { background: "var(--warn)" } : null}>
                  <td>{it.name}{m.note ? <div className="small muted">{m.note}</div> : null}</td>
                  <td className="r">{out ? "" : "คืน "}{fmt(m.qty)} {it.unit}</td>
                  <td className="nw">{m.kind === "waste" ? <span className="red">ของเสีย</span> : out ? LOC_NAME[m.to_loc] : "จาก" + (LOC_NAME[m.from_loc] || "ผลิต")}</td>
                  <td className="r">{fmt(r2(A(m.qty) * (A(m.unit_cost) + A(m.unit_vat))), 2)}{A(m.unit_vat) ? <div className="small muted">รวม VAT {fmt(r2(A(m.qty) * A(m.unit_vat)), 2)}</div> : null}</td>
                  <td className="nw">{out && (m.kind === "draw" || m.kind === "waste") && <button className="link" onClick={() => edit(m)}>แก้</button>}<button className="link red" onClick={() => del(m)}>ลบ</button></td>
                </tr>);
            })}</tbody>
          </table></div>)}
      </div>

      <StockTable data={data} all={all} setAll={setAll} />
      <LocStockTable data={data} />
    </>
  );
}

/* ── ตารางสต๊อก: คงเหลือคลังกลาง + ของที่ออกไปแต่ละที่ในเดือนนี้ (เบิก − คืน) + ของเสีย ── */
function monthFlow(data) {
  const f = {};
  for (const m of data.monthMoves) {
    const q = A(m.qty), v = r2(q * (A(m.unit_cost) + A(m.unit_vat)));
    let col, sg;
    if (m.from_loc === "main") { col = m.kind === "waste" ? "waste" : m.to_loc; sg = 1; }
    else if (m.to_loc === "main") { col = m.from_loc; sg = -1; }
    if (!col) continue;
    const x = (f[m.item_id] ||= {});
    x[col] = r2((x[col] || 0) + sg * q);
    x["v_" + col] = r2((x["v_" + col] || 0) + sg * v);
  }
  return f;
}
function StockTable({ data, all, setAll }) {
  const flow = monthFlow(data);
  const rows = data.items.map((it) => ({ it, s: data.stockById[it.id], f: flow[it.id] || {} }))
    .filter(({ s, f }) => (s && (all || A(s.qty) !== 0)) || Object.keys(f).length);
  const tot = (k) => r2(rows.reduce((t, r) => t + A(r.f["v_" + k]), 0));
  const totalVal = r2(rows.reduce((t, { s }) => t + A(s?.value), 0));
  const ym = data.date.slice(0, 7);
  return (
    <div className="card">
      <div className="bar"><h2 style={{ margin: 0 }}>สต๊อกคลังกลาง และของที่ออกไปแต่ละร้าน</h2>
        <label className="chk" style={{ marginLeft: "auto" }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> แสดงที่หมดแล้ว</label></div>
      {!rows.length ? <p className="muted">ยังไม่มีของในคลังกลาง</p> : (
        <div className="scroll"><table className="grid">
          <thead>
            <tr><th rowSpan={2}>สินค้า</th><th colSpan={3}>คลังกลางตอนนี้</th><th colSpan={FLOW_COLS.length}>ออกไปเดือน {ym.slice(5)}/{ym.slice(0, 4)} (เบิก − คืน)</th></tr>
            <tr><th>คงเหลือ</th><th>ราคาเฉลี่ย</th><th>มูลค่า</th>{FLOW_COLS.map(([k, v]) => <th key={k} className={k === "waste" ? "red" : ""}>{v}</th>)}</tr>
          </thead>
          <tbody>{rows.map(({ it, s, f }) => (
            <tr key={it.id}><td>{it.name} <span className="small muted">{it.unit}</span>{it.tier === 2 && <span className="tag">นับสิ้นเดือน</span>}</td>
              <td className={"r b" + (A(s?.qty) < 0 ? " red" : "")}>{s ? fmt(s.qty) : ""}</td><td className="r">{s ? fmt(s.avg_cost, 2) : ""}</td><td className="r">{s ? fmt(s.value, 2) : ""}</td>
              {FLOW_COLS.map(([k]) => <td key={k} className={"r" + (k === "waste" && f[k] ? " red" : "")}>{f[k] ? fmt(f[k]) : ""}</td>)}</tr>))}</tbody>
          <tfoot><tr><td>มูลค่ารวม (บาท)</td><td></td><td></td><td className="r">{fmt(totalVal, 2)}</td>{FLOW_COLS.map(([k]) => <td key={k} className="r">{tot(k) ? fmt(tot(k), 2) : ""}</td>)}</tr></tfoot>
        </table></div>)}
      <p className="small muted">คงเหลือ/ราคาเฉลี่ย/มูลค่า ไม่รวม VAT ซื้อ · ช่อง "ออกไป" = ที่เบิกจากคลังกลางเดือนนี้ (มูลค่าแถวล่างรวม VAT ที่แบ่งให้ร้าน) — ของที่เบิกถือว่าร้านใช้ไปแล้ว สต๊อกหน้าร้าน/โรงงานดูที่หน้าของแต่ละร้าน</p>
    </div>
  );
}

/* ── สต๊อกทุกที่ ณ สิ้นวันที่เลือก (inv_loc_stock) ── */
const STOCK_COLS = [["main", "คลังกลาง"], ["factory", "โรงลูกชิ้น"], ["gbs", "ซัน"], ["gbk", "เกด"], ["ns", "ก๋วยเตี๋ยว"], ["ls", "ร้านลาบ"]];
function locStockRows(data) {
  const by = {};
  for (const s of data.locStock) (by[s.item_id] ||= {})[s.location] = A(s.qty);
  return data.items.filter((it) => by[it.id]).map((it) => ({ it, q: by[it.id] }));
}
function LocStockTable({ data }) {
  const rows = locStockRows(data);
  return (
    <div className="card">
      <h2>สต๊อกทุกที่ ณ สิ้นวันที่ {dm(data.date)}</h2>
      {!rows.length ? <p className="muted">ไม่มีของคงเหลือ</p> : (
        <div className="scroll"><table className="grid">
          <thead><tr><th>สินค้า</th>{STOCK_COLS.map(([k, v]) => <th key={k}>{v}</th>)}</tr></thead>
          <tbody>{rows.map(({ it, q }) => (
            <tr key={it.id}><td>{it.name} <span className="small muted">{it.unit}</span></td>
              {STOCK_COLS.map(([k]) => <td key={k} className={"r" + (q[k] < 0 ? " red b" : "")}>{q[k] ? fmt(q[k]) : ""}</td>)}</tr>))}</tbody>
        </table></div>)}
      <p className="small muted">นับจากการซื้อเข้าคลังกลาง + การย้ายของทุกหน้า (ลูกชิ้นปิ้ง · FT · คลังกลาง) ถึงสิ้นวันที่เลือก · ของที่เบิกจากคลังกลางไปร้านถือว่าใช้แล้ว ไม่ขึ้นเป็นสต๊อกร้าน · ตัวแดง = ติดลบ (ย้ายออกมากกว่าที่มี ควรเช็ค)</p>
    </div>
  );
}

/* ── ส่งออก CSV (เปิดได้ทั้ง Numbers และ Excel) — ดึงทีละ 1,000 แถว + นับเทียบ ผ่าน fetchAll ── */
const csvCell = (v) => { const t = v == null ? "" : String(v); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
function downloadCsv(name, head, rows) {
  const text = "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const LOC_ALL = { ...LOC_NAME, main: "คลังกลาง" };
const KIND_NAME = { draw: "เบิก", waste: "ของเสีย", transfer: "ย้าย", return: "คืน", produce: "ผลิต", adjust: "ปรับยอดนับ", use: "ใช้", purchase: "ซื้อ" };
async function exportCsv(kind, data) {
  const from = monthStart(data.date), to = monthEnd(data.date), ym = data.date.slice(0, 7);
  const it = (id) => data.itemById[id] || {};
  if (kind === "buy") {
    const rows = await fetchAll("inv_purchases", "*", (q) => q.gte("purchase_date", from).lte("purchase_date", to));
    rows.sort((a, b) => a.purchase_date.localeCompare(b.purchase_date) || a.created_at.localeCompare(b.created_at));
    const bill = Object.fromEntries(data.bills.map((b) => [b.id, `${dm(b.bill_date)} ${b.vendor_name || ""} ${b.amount}`.trim()]));
    downloadCsv(`ซื้อของ-${ym}.csv`, ["วันที่", "รายการ", "หมวด", "จำนวน", "หน่วย", "ราคา/หน่วย", "ราคารวม", "VAT ซื้อ", "สำหรับ", "จ่ายจาก", "ของร้าน", "ใบกำกับ", "ร้านที่ซื้อ", "บิล", "หมายเหตุ"],
      rows.map((p) => [p.purchase_date, it(p.item_id).name, it(p.item_id).category, p.qty, it(p.item_id).unit, p.unit_price, p.amount, p.vat_amount,
        LOC_ALL[p.for_loc], PAID_NAME[p.paid_from], ENT_NAME[p.paid_entity] || "", p.has_tax_invoice ? "มี" : "", p.vendor_name, p.bill_id ? bill[p.bill_id] || "" : "", p.note]));
    return rows.length;
  }
  if (kind === "move") {
    const rows = await fetchAll("inv_moves", "*", (q) => q.gte("move_date", from).lte("move_date", to));
    rows.sort((a, b) => a.move_date.localeCompare(b.move_date) || a.created_at.localeCompare(b.created_at));
    downloadCsv(`ย้ายของ-เบิก-ของเสีย-${ym}.csv`, ["วันที่", "ประเภท", "รายการ", "จำนวน", "หน่วย", "จาก", "ไป", "ต้นทุน/หน่วย", "VAT/หน่วย", "ต้นทุนรวม", "ลงจากหน้า", "หมายเหตุ"],
      rows.map((m) => [m.move_date, KIND_NAME[m.kind] || m.kind, it(m.item_id).name, m.qty, it(m.item_id).unit, LOC_ALL[m.from_loc] || "", LOC_ALL[m.to_loc] || "",
        m.unit_cost ?? "", m.unit_vat ?? "", m.unit_cost != null ? r2(A(m.qty) * (A(m.unit_cost) + A(m.unit_vat))) : "", m.source, m.note]));
    return rows.length;
  }
  if (kind === "pay") {
    const rows = await fetchAll("inv_purchase_payments", "*", (q) => q.gte("pay_date", from).lte("pay_date", to));
    rows.sort((a, b) => a.pay_date.localeCompare(b.pay_date));
    const pur = Object.fromEntries(data.credits.map((p) => [p.id, p]));
    downloadCsv(`จ่ายหนี้ซื้อเชื่อ-${ym}.csv`, ["วันที่จ่าย", "รายการ", "วันที่ซื้อ", "ร้านที่ซื้อ", "จำนวนเงิน", "จ่ายจาก", "ของร้าน", "หมายเหตุ"],
      rows.map((y) => { const p = pur[y.purchase_id] || {}; return [y.pay_date, it(p.item_id).name, p.purchase_date, p.vendor_name, y.amount, PAID_NAME[y.paid_from], ENT_NAME[y.paid_entity] || "", y.note]; }));
    return rows.length;
  }
  const rows = locStockRows(data);
  downloadCsv(`สต๊อก-${data.date}.csv`, ["รายการ", "หมวด", "หน่วย", ...STOCK_COLS.map(([, v]) => v), "ราคาเฉลี่ยคลังกลาง (ตอนนี้)", "มูลค่าคลังกลาง (ตอนนี้)"],
    rows.map(({ it: i, q }) => [i.name, i.category, i.unit, ...STOCK_COLS.map(([k]) => q[k] || ""), data.stockById[i.id]?.avg_cost ?? "", data.stockById[i.id]?.value ?? ""]));
  return rows.length;
}
function ExportCard({ data }) {
  const [busy, setBusy] = useState(""), [note, setNote] = useState("");
  const ym = data.date.slice(0, 7);
  const go = async (k) => {
    setBusy(k); setNote("");
    try { const n = await exportCsv(k, data); setNote(`ส่งออกแล้ว ${n} แถว (ครบตามที่นับได้)`); }
    catch (e) { setNote("ส่งออกไม่สำเร็จ: " + errText(e)); }
    setBusy("");
  };
  const B = ({ k, t }) => <button className="ghost" disabled={!!busy} onClick={() => go(k)}>{busy === k ? "กำลังดึง…" : t}</button>;
  return (
    <div className="card">
      <h2>ส่งออกไฟล์ (CSV) เดือน {ym.slice(5)}/{ym.slice(0, 4)}</h2>
      <div className="row"><B k="buy" t="ซื้อของ" /><B k="move" t="ย้ายของ/เบิก/ของเสีย" /><B k="pay" t="จ่ายหนี้ซื้อเชื่อ" /><B k="stock" t={`สต๊อก ณ ${dm(data.date)}`} /></div>
      {note && <p className={"small" + (note.startsWith("ส่งออกไม่") ? " red" : "")}>{note}</p>}
      <p className="small muted">เปิดได้ทั้ง Numbers และ Excel · เดือนตามวันที่ด้านบน · ดึงทีละ 1,000 แถวและนับเทียบ ถ้าไม่ครบจะไม่สร้างไฟล์</p>
    </div>
  );
}

/* ── เมนูภาพรวม: ทุกกิจการเดือนที่เลือก (จากสมุดบัญชี) + คลังกลาง ── */
function OverviewTab({ data, setTab, setMsg }) {
  const [ov, setOv] = useState(null), [err, setErr] = useState("");
  const from = monthStart(data.date), to = monthEnd(data.date);
  useEffect(() => {
    let live = true; setOv(null); setErr("");
    supabase.rpc("wh_overview", { p_from: from, p_to: to }).then(({ data: d, error }) => {
      if (!live) return; if (error) setErr(errText(error)); else setOv(d || []);
    });
    return () => { live = false; };
  }, [from, to, data]);
  const by = Object.fromEntries((ov || []).map((r) => [r.entity, r]));
  const rows = ENT_ORDER.map(([e, n]) => {
    const r = by[e];
    if (!r) return { e, n, none: true };
    const sales = r2(A(r.sales) + A(r.vat_out)), cost = r2(A(r.cost)), exp = r2(A(r.expense));
    return { e, n, sales, cost, exp, profit: r2(sales - cost - exp) };
  });
  const T = rows.filter((r) => !r.none).reduce((t, r) => ({ sales: t.sales + r.sales, cost: t.cost + r.cost, exp: t.exp + r.exp, profit: t.profit + r.profit }), { sales: 0, cost: 0, exp: 0, profit: 0 });
  const flow = monthFlow(data);
  const stockVal = r2(data.stock.reduce((t, s) => t + A(s.value), 0));
  const debt = r2(data.credits.reduce((t, p) => t + Math.max(0, A(p.amount) - (data.paidBy[p.id] || 0)), 0));
  let drawVal = 0, wasteVal = 0;
  for (const f of Object.values(flow)) for (const [k, v] of Object.entries(f)) if (k.startsWith("v_")) { if (k === "v_waste") wasteVal += v; else drawVal += v; }
  const openBills = data.bills.filter((b) => billLeft(data, b) > 0.004).length;
  const ym = data.date.slice(0, 7);
  const Stat = ({ t, v, sub, red }) => <div className="stat"><small>{t}</small><b className={red ? "red" : ""}>{v}</b>{sub && <small className="muted">{sub}</small>}</div>;
  return (
    <>
      <div className="card">
        <h2>ลงงานวันนี้</h2>
        <div className="row">
          <button onClick={() => setTab("buy")}>ซื้อของ</button>
          <button onClick={() => setTab("stock")}>เบิกจากคลัง</button>
          <button onClick={() => { setTab("stock"); setMsg("เลือก \"เบิกไป: ของเสีย (ทิ้ง)\""); }}>ของเสีย</button>
          <button className="ghost" onClick={() => setTab("items")}>สินค้า</button>
        </div>
      </div>
      <div className="card">
        <h2>คลังกลาง</h2>
        <div className="stats">
          <Stat t="มูลค่าของในคลังตอนนี้" v={fmt(stockVal, 2)} sub="ไม่รวม VAT" />
          <Stat t="หนี้ค่าของค้างจ่าย" v={fmt(debt, 2)} sub="ซื้อเชื่อที่ยังไม่จ่าย" red={debt > 0} />
          {openBills > 0 && <Stat t="บิลรอใส่รายละเอียด" v={`${openBills} บิล`} sub="กดเมนูซื้อของ" red />}
          <Stat t={`เบิกออกเดือน ${ym.slice(5)}`} v={fmt(r2(drawVal), 2)} sub="เป็นต้นทุนร้านแล้ว" />
          <Stat t={`ของเสียเดือน ${ym.slice(5)}`} v={fmt(r2(wasteVal), 2)} red={wasteVal > 0} />
        </div>
      </div>
      <div className="card">
        <h2>ทุกกิจการ เดือน {ym.slice(5)}/{ym.slice(0, 4)}</h2>
        {err ? <p className="red">โหลดไม่ได้: {err}</p> : !ov ? <p className="muted">กำลังโหลด…</p> : (
          <div className="scroll"><table className="grid">
            <thead><tr><th>กิจการ</th><th>ยอดขาย (รวม VAT)</th><th>ต้นทุน</th><th>ค่าใช้จ่าย</th><th>กำไรเบื้องต้น</th></tr></thead>
            <tbody>{rows.map((r) => r.none ? (
              <tr key={r.e} className="muted"><td>{r.n}</td><td colSpan={4}>ยังไม่มีรายการเดือนนี้</td></tr>
            ) : (
              <tr key={r.e}><td>{r.n}</td><td className="r">{fmt(r.sales, 2)}</td><td className="r">{fmt(r.cost, 2)}</td><td className="r">{fmt(r.exp, 2)}</td>
                <td className={"r b" + (r.profit < 0 ? " red" : "")}>{fmt(r.profit, 2)}</td></tr>))}</tbody>
            <tfoot><tr><td>รวม</td><td className="r">{fmt(r2(T.sales), 2)}</td><td className="r">{fmt(r2(T.cost), 2)}</td><td className="r">{fmt(r2(T.exp), 2)}</td><td className="r b">{fmt(r2(T.profit), 2)}</td></tr></tfoot>
          </table></div>)}
        <p className="small muted">จากสมุดบัญชีของแต่ละร้าน (ลงจากหน้าร้าน + หน้าคลังกลาง) · กำไรเบื้องต้น = ยอดขายรวม VAT − ต้นทุน − ค่าใช้จ่าย ยังไม่หัก VAT ขาย/ภาษี
          · โรงลูกชิ้นยังไม่มีต้นทุนก่อน พ.ย. 69 · ลูกชิ้นปิ้งยังไม่หักต้นทุนลูกชิ้น · ร้านลาบดูกำไรหลัง VAT ที่แดชบอร์ดร้านลาบ · ไม่แสดงเงินคงเหลือ เพราะบัญชียังไม่มียอดเงินตั้งต้น</p>
      </div>
      <ExportCard data={data} />
    </>
  );
}

/* ── เมนูสินค้า ── */
function ItemsTab({ data, reload, setMsg }) {
  const [edits, setEdits] = useState({}), [q, setQ] = useState(""), [busy, setBusy] = useState(false);
  const [nw, setNw] = useState({ name: "", cat: "", unit: "", tier2: false }), [err, setErr] = useState("");
  const val = (it, k) => (edits[it.id]?.[k] ?? it[k]);
  const setE = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...e[id], [k]: v } }));
  const dirty = Object.keys(edits);
  const list = data.items.filter((i) => !q || i.name.includes(q) || (i.category || "").includes(q));

  const saveAll = async () => {
    setBusy(true); setErr("");
    try {
      for (const id of dirty) {
        const e = edits[id], it = data.itemById[id], row = {};
        for (const k of ["category", "unit", "tier", "is_active"]) if (k in e && e[k] !== it[k]) row[k] = e[k];
        if (Object.keys(row).length) chk(await supabase.from("inv_items").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id));
      }
      setEdits({}); setMsg("บันทึกสินค้าแล้ว"); await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const add = async () => {
    setErr("");
    if (!nw.name.trim() || !nw.cat || !nw.unit.trim()) return setErr("ใส่ชื่อ หมวด และหน่วย");
    if (data.items.some((i) => i.name === nw.name.trim())) return setErr("มีสินค้าชื่อนี้แล้ว");
    try {
      chk(await supabase.from("inv_items").insert({ name: nw.name.trim(), category: nw.cat, unit: nw.unit.trim(), tier: nw.tier2 ? 2 : 1 }));
      setNw({ name: "", cat: "", unit: "", tier2: false }); setMsg("เพิ่มสินค้าแล้ว"); await reload();
    } catch (e) { setErr(errText(e)); }
  };

  return (
    <>
      <div className="card">
        <div className="bar"><h2 style={{ margin: 0 }}>สินค้า ({data.items.length})</h2>
          <input placeholder="ค้นหา" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: "auto", width: "10em" }} /></div>
        <div className="scroll"><table className="grid">
          <thead><tr><th>ชื่อ</th><th style={{ textAlign: "left" }}>หมวด</th><th style={{ textAlign: "left" }}>หน่วย</th><th>นับสิ้นเดือน</th><th>ใช้อยู่</th></tr></thead>
          <tbody>{list.map((it) => (
            <tr key={it.id} style={edits[it.id] ? { background: "var(--warn)" } : null}>
              <td>{it.name}{it.is_produced && <span className="tag">ผลิตเอง</span>}</td>
              <td><select value={val(it, "category") || ""} onChange={(e) => setE(it.id, "category", e.target.value)}>
                <option value="">—</option>{data.cats.map((c) => <option key={c.name}>{c.name}</option>)}
                {it.category && !data.cats.some((c) => c.name === it.category) && <option>{it.category}</option>}</select></td>
              <td><input value={val(it, "unit") || ""} onChange={(e) => setE(it.id, "unit", e.target.value)} style={{ width: "5em" }} /></td>
              <td className="r"><input type="checkbox" checked={val(it, "tier") === 2} onChange={(e) => setE(it.id, "tier", e.target.checked ? 2 : 1)} /></td>
              <td className="r"><input type="checkbox" checked={!!val(it, "is_active")} onChange={(e) => setE(it.id, "is_active", e.target.checked)} /></td>
            </tr>))}</tbody>
        </table></div>
        {dirty.length > 0 && <div className="row"><button disabled={busy} onClick={saveAll}>บันทึก {dirty.length} รายการ</button>
          <button className="ghost" onClick={() => setEdits({})}>ยกเลิก</button></div>}
        <p className="small muted">หมวดใช้เลือกบัญชีต้นทุนของแต่ละร้าน (หมวดที่ร้านนั้นไม่มีคู่บัญชี = ลงเบ็ดเตล็ด)</p>
      </div>
      <div className="card">
        <h2>เพิ่มสินค้าใหม่</h2>
        <div className="row">
          <label style={{ flex: "1 1 180px" }}>ชื่อ<input value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} style={{ width: "100%" }} /></label>
          <label>หมวด<select value={nw.cat} onChange={(e) => setNw({ ...nw, cat: e.target.value })}><option value="">— เลือก —</option>{data.cats.map((c) => <option key={c.name}>{c.name}</option>)}</select></label>
          <label>หน่วย<input value={nw.unit} onChange={(e) => setNw({ ...nw, unit: e.target.value })} style={{ width: "6em" }} /></label>
        </div>
        <label className="chk"><input type="checkbox" checked={nw.tier2} onChange={(e) => setNw({ ...nw, tier2: e.target.checked })} /> นับสิ้นเดือน</label>
        {err && <p className="red">{err}</p>}
        <button onClick={add}>เพิ่มสินค้า</button>
      </div>
    </>
  );
}

function App() {
  const [session, setSession] = useState(undefined);
  const [date, setDate] = useState(() => initialDate(todayTH())), [tab, setTab] = useState("ov");
  const [data, setData] = useState(null), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  const [billId, setBillId] = useState(null);   // บิลที่กำลังใส่สินค้า (อยู่รอดตอนเปลี่ยนวันที่)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  // ก่อนโหลด: รอเช็ค/ต่ออายุล็อกอินให้เสร็จ (แท็บเปิดค้างข้ามคืน) · พลาดครั้งแรก ลองใหม่เองอีก 1 ครั้ง
  const reload = useCallback(async () => {
    setErr("");
    for (let i = 0; i < 2; i++) {
      try { await supabase.auth.getSession(); setData(await loadAll(date)); return; }
      catch (e) { if (i) setErr(errText(e)); else await new Promise((r) => setTimeout(r, 800)); }
    }
  }, [date]);
  useEffect(() => { if (session) { setData(null); reload(); } }, [session, date]);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(""), 4000); return () => clearTimeout(t); } }, [msg]);
  if (session === undefined) return <p className="muted pad">กำลังโหลด…</p>;
  if (!session) return <Login />;
  const TABS = [["ov", "ภาพรวม"], ["buy", "ซื้อของ"], ["stock", "คลัง/เบิก"], ["items", "สินค้า"]];
  const p = { data, reload, setMsg, setTab, billId, setBillId, setDate };
  return (
    <>
      <SiteNav current="wh" date={date} />
      
      <header>
        <h1>คลังกลาง</h1>
      </header>
      <div className="bar">
        <button className="ghost sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="ghost sm" onClick={() => setDate(addDays(date, 1))}>›</button>
      </div>
      <nav className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {msg && <div className="toast">{msg}</div>}
      {err && <p className="red pad">โหลดข้อมูลไม่ได้: {err} <button className="link" onClick={() => location.reload()}>รีเฟรช</button></p>}
      {!data ? (!err && <p className="muted pad">กำลังโหลด…</p>) : (
        tab === "ov" ? <OverviewTab {...p} /> : tab === "buy" ? <BuyTab {...p} /> : tab === "stock" ? <StockTab {...p} /> : <ItemsTab {...p} />)}
      <p className="muted small pad">ผู้ใช้: {session.user.email} · <button className="link" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button></p>
    </>
  );
}

createRoot(document.getElementById("app")).render(<App />);
