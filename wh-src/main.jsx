// หน้า "คลังกลาง + ซื้อของ" (หน้าทดสอบ) — 3 เมนู: ซื้อของ · คลัง/เบิก · สินค้า
// ข้อมูล: inv_purchases · inv_moves (เบิกจาก/คืนคลังกลาง from_loc/to_loc = 'main') · inv_items · inv_categories
// ลงบัญชีอัตโนมัติที่ฐานข้อมูล (trigger wh_after_change → ใบบัญชี wh_purchase / wh_pay / wh_draw ผูก source_id)
// ดึงข้อมูลทั้งตารางเป็นช่วง ทีละ 1,000 แถว + นับเทียบ (Supabase ตัดเหลือ 1,000 แถวโดยไม่เตือน)
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "../supabaseClient.js";

const LOCS = [["main", "คลังกลาง (ใช้ร่วม)"], ["ls", "ร้านลาบ"], ["factory", "โรงลูกชิ้น"], ["gbs", "ซัน"], ["gbk", "เกด"], ["ns", "ร้านก๋วยเตี๋ยว"]];
const LOC_NAME = Object.fromEntries(LOCS.map(([k, v]) => [k, v.replace(" (ใช้ร่วม)", "")]));
const DRAW_TO = LOCS.filter(([k]) => k !== "main");
const ENTS = [["LS", "ร้านลาบ"], ["FT", "โรงลูกชิ้น"], ["GBS", "ซัน"], ["GBK", "เกด"], ["NS", "ร้านก๋วยเตี๋ยว"]];
const ENT_NAME = Object.fromEntries(ENTS);
const PAID = [["pool", "กองกลาง"], ["drawer", "ลิ้นชักร้าน"], ["transfer", "โอน"]];
const PAID_NAME = Object.fromEntries(PAID);
const LOC_ENT = { ls: "LS", factory: "FT", gbs: "GBS", gbk: "GBK", ns: "NS" };

const A = (v) => { const n = parseFloat(String(v ?? "").replace(/,/g, "")); return isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n, d = 0) => (n == null ? "" : Number(n).toLocaleString("th-TH", { minimumFractionDigits: d, maximumFractionDigits: 2 }));
const todayTH = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const chk = ({ data, error }) => { if (error) throw error; return data; };
const errText = (e) => String(e?.message || e).replace(/^.*?ERROR:\s*/, "");

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

async function loadAll(date) {
  const [items, cats, purchases, moves, stock] = await Promise.all([
    fetchAll("inv_items", "*"),
    fetchAll("inv_categories", "*", (q) => q, "sort_order"),
    fetchAll("inv_purchases", "*", (q) => q.eq("purchase_date", date)),
    fetchAll("inv_moves", "*", (q) => q.eq("move_date", date).or("from_loc.eq.main,to_loc.eq.main")),
    fetchStock(),
  ]);
  items.sort((a, b) => (a.category || "").localeCompare(b.category || "", "th") || a.name.localeCompare(b.name, "th"));
  return { date, items, cats: cats.filter((c) => c.is_active), purchases, moves, stock,
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
  forLoc: "main", paidFrom: "pool", paidEnt: "LS", inv: false, vendor: "", note: "" };

function BuyTab({ data, reload, setMsg }) {
  const [f, setF] = useState(EMPTY), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
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
    setBusy(true);
    try {
      let itemId = known?.id;
      if (!itemId) {
        itemId = chk(await supabase.from("inv_items").insert({ name, unit: f.unit.trim(), category: f.cat, tier: f.tier2 ? 2 : 1 })
          .select("id").single()).id;
      }
      const row = { purchase_date: data.date, item_id: itemId, qty, unit_price: price, amount: total, has_tax_invoice: f.inv,
        for_loc: f.forLoc, paid_from: f.paidFrom, paid_entity: f.paidFrom === "pool" ? null : f.paidEnt,
        vendor_name: f.vendor.trim() || null, note: f.note.trim() || null };
      if (f.id) chk(await supabase.from("inv_purchases").update(row).eq("id", f.id));
      else chk(await supabase.from("inv_purchases").insert(row));
      setMsg(f.id ? "แก้รายการแล้ว" : "บันทึกแล้ว");
      setF({ ...EMPTY, forLoc: f.forLoc, paidFrom: f.paidFrom, paidEnt: f.paidEnt, vendor: f.vendor });
      await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const edit = (p) => {
    const it = data.itemById[p.item_id] || {};
    setF({ id: p.id, name: it.name || "", cat: it.category || "", unit: it.unit || "", tier2: it.tier === 2, qty: String(p.qty),
      price: String(p.unit_price ?? ""), total: String(p.amount), last: "total", forLoc: p.for_loc, paidFrom: p.paid_from,
      paidEnt: p.paid_entity || "LS", inv: p.has_tax_invoice, vendor: p.vendor_name || "", note: p.note || "" });
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
      <div className="card">
        <h2>{f.id ? "แก้รายการซื้อ" : "ลงของที่ซื้อ"}</h2>
        <div className="row">
          <label style={{ flex: "1 1 220px" }}>รายการ
            <input list="items" value={f.name} onChange={(e) => onName(e.target.value)} placeholder="พิมพ์ชื่อ (ชื่อใหม่ = เพิ่มสินค้าใหม่)" style={{ width: "100%" }} />
          </label>
          <datalist id="items">{data.items.filter((i) => i.is_active).map((i) => <option key={i.id} value={i.name} />)}</datalist>
          <label>หมวด
            <select value={f.cat} disabled={!!known} onChange={(e) => set("cat", e.target.value)}>
              <option value="">— เลือก —</option>
              {data.cats.map((c) => <option key={c.name}>{c.name}</option>)}
              {f.cat && !data.cats.some((c) => c.name === f.cat) && <option>{f.cat}</option>}
            </select>
          </label>
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
            <select value={f.paidFrom} onChange={(e) => set("paidFrom", e.target.value)}>{PAID.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          {f.paidFrom !== "pool" && <label>ของร้าน
            <select value={f.paidEnt} onChange={(e) => set("paidEnt", e.target.value)}>{ENTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>}
          <label className="chk" style={{ paddingBottom: 12 }}><input type="checkbox" checked={f.inv} onChange={(e) => set("inv", e.target.checked)} /> มีใบกำกับภาษี</label>
        </div>
        <div className="row">
          <label style={{ flex: "1 1 160px" }}>ร้านที่ซื้อ<input value={f.vendor} onChange={(e) => set("vendor", e.target.value)} style={{ width: "100%" }} /></label>
          <label style={{ flex: "1 1 160px" }}>หมายเหตุ<input value={f.note} onChange={(e) => set("note", e.target.value)} style={{ width: "100%" }} /></label>
        </div>
        <p className="small muted">
          {total ? <>รวม <b>{fmt(total, 2)}</b> บาท{vat ? <> · VAT ซื้อ {fmt(vat, 2)}</> : null} · </> : null}
          {f.forLoc === "main" ? "เข้าสต๊อกคลังกลาง แล้วร้านกดเบิก" : forEnt === "NS" ? "ร้านก๋วยเตี๋ยวยังไม่มีผังบัญชี — บันทึกได้ แต่ยังไม่ลงบัญชี"
            : `เป็นต้นทุนของ${LOC_NAME[f.forLoc]}ทันที`}
        </p>
        {err && <p className="red">{err}</p>}
        <div className="row">
          <button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : f.id ? "บันทึกที่แก้" : "บันทึก"}</button>
          {f.id && <button className="ghost" onClick={() => setF(EMPTY)}>ยกเลิกแก้</button>}
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
                  <td>{it.name}<div className="small muted">{it.category}{p.vendor_name ? " · " + p.vendor_name : ""}{p.has_tax_invoice ? " · ใบกำกับ" : ""}{p.note ? " · " + p.note : ""}</div></td>
                  <td className="r">{fmt(p.qty)} {it.unit}</td>
                  <td className="r">{fmt(p.amount, 2)}{A(p.vat_amount) ? <div className="small muted">VAT {fmt(p.vat_amount, 2)}</div> : null}</td>
                  <td className="nw">{LOC_NAME[p.for_loc]}</td>
                  <td className="nw">{PAID_NAME[p.paid_from]}{p.paid_entity && p.paid_from !== "pool" ? " " + ENT_NAME[p.paid_entity] : ""}</td>
                  <td className="nw"><button className="link" onClick={() => edit(p)}>แก้</button><button className="link red" onClick={() => del(p)}>ลบ</button></td>
                </tr>);
            })}</tbody>
            <tfoot><tr><td>รวม</td><td></td><td className="r">{fmt(sum, 2)}{sumVat ? <div className="small">VAT {fmt(sumVat, 2)}</div> : null}</td><td colSpan={3}></td></tr></tfoot>
          </table></div>)}
      </div>
    </>
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
      const row = { move_date: data.date, kind: "draw", item_id: itemId, qty: A(qty), from_loc: "main", to_loc: to, source: "wh", note: note.trim() || null };
      if (editId) chk(await supabase.from("inv_moves").update(row).eq("id", editId));
      else chk(await supabase.from("inv_moves").insert(row));
      setMsg(editId ? "แก้การเบิกแล้ว" : "เบิกแล้ว");
      setEditId(null); setQty(""); setNote(""); setItemId("");
      await reload();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  };
  const edit = (m) => { setEditId(m.id); setItemId(m.item_id); setQty(String(m.qty)); setTo(m.to_loc); setNote(m.note || ""); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const del = async (m) => {
    const it = data.itemById[m.item_id];
    if (!window.confirm(`ลบการเบิก "${it?.name}" ${fmt(m.qty)} ${it?.unit || ""} ไป${LOC_NAME[m.to_loc] || ""} ? (ของจะกลับเข้าคลัง)`)) return;
    try { chk(await supabase.from("inv_moves").delete().eq("id", m.id)); setMsg("ลบแล้ว"); await reload(); }
    catch (e) { window.alert(errText(e)); }
  };
  const draws = [...data.moves].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <>
      <div className="card">
        <h2>{editId ? "แก้การเบิก" : "เบิกของจากคลังกลาง"}</h2>
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
        {cur && A(qty) > 0 && <p className="small muted">ต้นทุนประมาณ {fmt(r2(A(qty) * A(cur.avg_cost)), 2)} บาท (ราคาเฉลี่ย {fmt(cur.avg_cost, 2)}/{data.itemById[itemId]?.unit} ไม่รวม VAT) → ต้นทุนของ{LOC_NAME[to]}
          {to === "ns" ? " · ร้านก๋วยเตี๋ยวยังไม่มีผังบัญชี ยังไม่ลงบัญชี" : ""}</p>}
        {err && <p className="red">{err}</p>}
        <div className="row">
          <button disabled={busy} onClick={save}>{busy ? "กำลังบันทึก…" : editId ? "บันทึกที่แก้" : "เบิก"}</button>
          {editId && <button className="ghost" onClick={() => { setEditId(null); setQty(""); setItemId(""); setNote(""); }}>ยกเลิกแก้</button>}
        </div>
      </div>

      <div className="card">
        <h2>เบิกวันนี้ ({draws.length} รายการ)</h2>
        {!draws.length ? <p className="muted">ยังไม่มีการเบิก</p> : (
          <div className="scroll"><table className="grid">
            <thead><tr><th>สินค้า</th><th>จำนวน</th><th>ไป</th><th>ต้นทุน</th><th></th></tr></thead>
            <tbody>{draws.map((m) => {
              const it = data.itemById[m.item_id] || {}, out = m.from_loc === "main";
              return (
                <tr key={m.id} style={editId === m.id ? { background: "var(--warn)" } : null}>
                  <td>{it.name}{m.note ? <div className="small muted">{m.note}</div> : null}</td>
                  <td className="r">{out ? "" : "คืน "}{fmt(m.qty)} {it.unit}</td>
                  <td className="nw">{out ? LOC_NAME[m.to_loc] : "จาก" + (LOC_NAME[m.from_loc] || "ผลิต")}</td>
                  <td className="r">{fmt(r2(A(m.qty) * (A(m.unit_cost) + A(m.unit_vat))), 2)}{A(m.unit_vat) ? <div className="small muted">รวม VAT {fmt(r2(A(m.qty) * A(m.unit_vat)), 2)}</div> : null}</td>
                  <td className="nw">{out && m.kind === "draw" && <button className="link" onClick={() => edit(m)}>แก้</button>}<button className="link red" onClick={() => del(m)}>ลบ</button></td>
                </tr>);
            })}</tbody>
          </table></div>)}
      </div>

      <div className="card">
        <div className="bar"><h2 style={{ margin: 0 }}>ของในคลังกลางตอนนี้</h2>
          <label className="chk" style={{ marginLeft: "auto" }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> แสดงที่หมดแล้ว</label></div>
        {!stockRows.length ? <p className="muted">ยังไม่มีของในคลังกลาง</p> : (
          <div className="scroll"><table className="grid">
            <thead><tr><th>สินค้า</th><th>คงเหลือ</th><th>ราคาเฉลี่ย</th><th>มูลค่า</th></tr></thead>
            <tbody>{stockRows.map(({ it, s }) => (
              <tr key={it.id}><td>{it.name}<span className="tag">{it.category || "-"}</span>{it.tier === 2 && <span className="tag">นับสิ้นเดือน</span>}</td>
                <td className={"r" + (A(s.qty) < 0 ? " red" : "")}>{fmt(s.qty)} {it.unit}</td><td className="r">{fmt(s.avg_cost, 2)}</td><td className="r">{fmt(s.value, 2)}</td></tr>))}</tbody>
            <tfoot><tr><td>รวม</td><td></td><td></td><td className="r">{fmt(totalVal, 2)}</td></tr></tfoot>
          </table></div>)}
        <p className="small muted">ราคา/มูลค่า ไม่รวม VAT ซื้อ (VAT แบ่งให้ร้านตามที่เบิก)</p>
      </div>
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
  const [date, setDate] = useState(todayTH()), [tab, setTab] = useState("buy");
  const [data, setData] = useState(null), [msg, setMsg] = useState(""), [err, setErr] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const reload = useCallback(async () => { try { setErr(""); setData(await loadAll(date)); } catch (e) { setErr(errText(e)); } }, [date]);
  useEffect(() => { if (session) { setData(null); reload(); } }, [session, date]);
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(""), 4000); return () => clearTimeout(t); } }, [msg]);
  if (session === undefined) return <p className="muted pad">กำลังโหลด…</p>;
  if (!session) return <Login />;
  const TABS = [["buy", "ซื้อของ"], ["stock", "คลัง/เบิก"], ["items", "สินค้า"]];
  const p = { data, reload, setMsg };
  return (
    <>
      <div className="testbar">หน้าทดสอบ — ข้อมูลที่ลงจะเข้าฐานข้อมูลจริง (ลงบัญชีร้านด้วย) ลบทิ้งได้ก่อนเริ่มใช้จริง 1 ธ.ค.</div>
      <header>
        <h1>คลังกลาง</h1>
        <nav><a href="../">ร้านลาบ</a><a href="../ft/">โรงลูกชิ้น</a><a href="../gb-test/">ลูกชิ้นปิ้ง</a></nav>
      </header>
      <div className="bar">
        <button className="ghost sm" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="ghost sm" onClick={() => setDate(addDays(date, 1))}>›</button>
      </div>
      <nav className="tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {msg && <div className="toast">{msg}</div>}
      {err && <p className="red pad">โหลดข้อมูลไม่ได้: {err}</p>}
      {!data ? <p className="muted pad">กำลังโหลด…</p> : (
        tab === "buy" ? <BuyTab {...p} /> : tab === "stock" ? <StockTab {...p} /> : <ItemsTab {...p} />)}
      <p className="muted small pad">ผู้ใช้: {session.user.email} · <button className="link" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button></p>
    </>
  );
}

createRoot(document.getElementById("app")).render(<App />);
