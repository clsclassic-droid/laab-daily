import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { supabase, ENTITY } from "./supabaseClient.js";

/* ═══════════════════════════════════════════════════════════
   หน้าจอบันทึกรายวัน ร้านลาบ (LS) — v15 (ต่อ Supabase)
   ตรงตามผังบัญชี laab_coa.xlsx และกฎแปลงรายการ

   หลักการใหญ่: อะไรที่บอสหนึ่งพิมพ์เอง ระบบห้ามแตะ
   ข้อมูลทั้งหมดเก็บใน Supabase (ฐานข้อมูลกลาง) แทน localStorage
   ต้องต่อเน็ตตอนใช้งาน — พนักงาน 3 คนใช้พร้อมกันได้ ข้อมูลซิงค์กัน
   ═══════════════════════════════════════════════════════════ */

/* ── วิธีจ่าย → บัญชีที่เครดิต (กฎข้อ 7-9, 13) ── */
const PAY = {
  cash:     { label: "สด",        code: "1010-LS", out: true  },
  transfer: { label: "โอน",       code: "1020-LS", out: false },
  credit:   { label: "เชื่อ",     code: "2010-LS", out: false },
  ns:       { label: "ก๋วยเตี๋ยว", code: "2100-LS", out: false },
};
const PAY_KEYS = Object.keys(PAY);
const NS = "ร้านก๋วยเตี๋ยว";

/* แปลงวิธีจ่ายระหว่างโค้ดหน้าจอ (cash/transfer/credit/ns) ↔ ค่าที่เก็บใน Supabase (…/intercompany) */
const PAY2DB = { cash: "cash", transfer: "transfer", credit: "credit", ns: "intercompany" };
const DB2PAY = { cash: "cash", transfer: "transfer", credit: "credit", intercompany: "ns" };

/* ── 17 หมวด จัดเป็น 4 กลุ่ม (ปรับ 30 ส.ค. 2569 จากตารางรายจ่ายจริง — ยกเลิกหมวด "จิปาถะ" รวม) ── */
const CATS = {
  meat:   { label: "ค่าเนื้อ",             code: "5010-LS", name: "ต้นทุนเนื้อสัตว์",              grp: "food",  box: "food" },
  veg:    { label: "ค่าผัก",               code: "5020-LS", name: "ต้นทุนผัก",                     grp: "food",  box: "food" },
  market: { label: "ค่าเครื่องปรุง/ของแห้ง", code: "5030-LS", name: "ต้นทุนเครื่องปรุง/ของแห้ง",     grp: "food",  box: "food" },
  rice:   { label: "ค่าข้าว/แป้ง",         code: "5050-LS", name: "ต้นทุนข้าว/แป้ง",               grp: "food",  box: "food" },

  bev:    { label: "ค่าเครื่องดื่ม (ไม่มีแอลกอฮอล์)", code: "5040-LS", name: "ต้นทุนเครื่องดื่ม(ไม่มีแอลกอฮอล์)", grp: "bev", box: "bev" },
  beer:   { label: "ค่าเครื่องดื่มแอลกอฮอล์", code: "5060-LS", name: "ต้นทุนเครื่องดื่มแอลกอฮอล์",    grp: "bev",   box: "bev" },
  ice:    { label: "ค่าน้ำแข็ง",           code: "5070-LS", name: "ต้นทุนน้ำแข็ง",                  grp: "bev",   box: "bev" },

  bag:    { label: "ถุง/กล่อง",            code: "6210-LS", name: "ค่าถุงพลาสติก/กล่องใส่อาหาร",   grp: "ops",   box: "pack" },
  cup:    { label: "แก้ว/ชาม",             code: "6220-LS", name: "ค่าแก้ว/ชาม",                   grp: "ops",   box: "pack" },
  straw:  { label: "หลอด/ช้อน/ตะเกียบ",    code: "6230-LS", name: "ค่าหลอด/ช้อน/ตะเกียบ",         grp: "ops",   box: "pack" },
  tissue: { label: "ทิชชู",                code: "6240-LS", name: "ค่าทิชชู/กระดาษเช็ดปาก",        grp: "ops",   box: "pack" },
  clean:  { label: "น้ำยาล้างจาน/ของใช้",  code: "6250-LS", name: "ค่าน้ำยาล้างจาน/ทำความสะอาด",   grp: "ops",  box: "pack" },

  wage:   { label: "ค่าแรงคนงาน",          code: "6010-LS", name: "ค่าแรงคนงาน",                   grp: "labor", box: "daily" },
  meal:   { label: "ค่าข้าวพนักงาน",       code: "6020-LS", name: "ค่าข้าวพนักงาน",                grp: "labor", box: "daily" },
  fuel:   { label: "ค่าน้ำมัน/ขนส่ง",      code: "6510-LS", name: "ค่าขนส่ง/ค่าน้ำมัน",            grp: "ops",   box: "daily" },
  gas:    { label: "ค่าแก๊ส",              code: "6140-LS", name: "ค่าแก๊ส",                       grp: "ops",   box: "daily" },
  rentEq: { label: "ค่าเช่าอุปกรณ์/เต็น",  code: "6115-LS", name: "ค่าเช่าอุปกรณ์/เต็น",           grp: "ops",   box: "daily" },
};
const CAT_BY_CODE = Object.fromEntries(Object.entries(CATS).map(([k, v]) => [v.code, k]));

const BOXES = [
  { key: "food",  title: "วัตถุดิบอาหาร — ซื้อทุกวัน",  hint: "เนื้อ ผัก เครื่องปรุง ข้าว/แป้ง" },
  { key: "bev",   title: "เครื่องดื่ม/น้ำแข็ง",          hint: "เครื่องดื่ม แอลกอฮอล์ น้ำแข็ง" },
  { key: "pack",  title: "บรรจุภัณฑ์และของใช้",         hint: "ซื้อเป็นครั้ง ไม่ใช่ทุกวัน" },
  { key: "daily", title: "ค่าใช้จ่ายดำเนินงาน",         hint: "ค่าแรง ค่าข้าวพนักงาน ค่าน้ำมัน ค่าแก๊ส ค่าเช่าอุปกรณ์" },
];
const catsIn = (box) => Object.keys(CATS).filter((c) => CATS[c].box === box);

const ACC = {
  "1010-LS": "เงินสดในร้าน",
  "1020-LS": "เงินฝากธนาคาร",
  "1030-LS": "ลูกหนี้ Grab",
  "1031-LS": "ลูกหนี้ไทยช่วยไทย",
  "1032-LS": "ลูกหนี้พนักงาน (เงินเบิกล่วงหน้า)",
  "2010-LS": "เจ้าหนี้การค้า",
  "2100-LS": "เจ้าหนี้ระหว่างกิจการ (ร้านก๋วยเตี๋ยว)",
  "4010-LS": "รายได้ขาย-เงินสด",
  "4020-LS": "รายได้ขาย-เงินโอน",
  "4030-LS": "รายได้ขาย-Grab",
  "4040-LS": "รายได้ขาย-ไทยช่วยไทย",
  "6330-LS": "ค่าคอมมิชชั่นแพลตฟอร์ม",
};
const accName = (c) => ACC[c] || Object.values(CATS).find((x) => x.code === c)?.name || c;

/* ราคาที่เคยซื้อจากแต่ละร้าน (ปุ่ม "เทียบ") — ยังเป็นข้อมูลสมมติ ผูกกับชื่อของ
   ⚠ ค่อยแทนด้วยของจริงทีหลัง (ตอนนี้ยังไม่ใช่จุดสำคัญของงานย้าย Supabase) */
const HIST = {
  "เนื้อออส": [["เจ๊แดง", 360], ["ลุงชิด", 375], ["ตลาดสด", 342], [NS, 340]],
  "เนื้อคอย่าง": [["ลุงชิด", 310], ["เจ๊แดง", 325]],
  "ไส้อ่อน": [["ร้านหมูสด", 240], ["เจ๊แดง", 265]],
  "ผ้าขี้ริ้ว": [["เจ๊แดง", 155], ["ลุงชิด", 168]],
  "สันนอก": [["เจ๊แดง", 275], ["ลุงชิด", 290]],
  "ตับ": [["ร้านหมูสด", 150], ["ตลาดสด", 145]],
  "ข้าวสาร": [[NS, 32], ["ร้านชำ", 36]],
  "พริกสด": [["ตลาดสด", 90], ["เจ๊หมวย", 105]],
  "ขนมจีน": [["เจ๊หมวย", 45], ["ตลาดสด", 50]],
};

/* ═══════════ helper (คำนวณ — เหมือนเดิมทุกจุด ไม่เปลี่ยน) ═══════════ */
const A = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const s2 = (n) => String(r2(n));
const has = (v) => v !== "" && v !== null && v !== undefined && v !== "-";
const money = (n) => {
  const v = r2(n);
  return v.toLocaleString("th-TH", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};
const dec = (n) => r2(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const pct = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "—");
const numStr = (s) => {
  let v = String(s).replace(/[^0-9.\-]/g, "");
  const neg = v.startsWith("-");
  v = v.replace(/-/g, "");
  const i = v.indexOf(".");
  if (i !== -1) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/\./g, "").slice(0, 2);
  return (neg ? "-" : "") + v;
};

const THMON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const parts = (d) => { const [y, m, dd] = String(d).split("-").map(Number); return { y: y + 543, m, d: dd }; };
const thDate = (d) => { const p = parts(d); return `${p.d} ${THMON[p.m - 1]} ${p.y}`; };
const jeNo = (d) => { const p = parts(d); return `RJ-${String(p.y).slice(2)}${String(p.m).padStart(2, "0")}${String(p.d).padStart(2, "0")}`; };
const todayISO = () => new Date().toISOString().slice(0, 10);

/* ── เดือน (period = "YYYY-MM") สำหรับปิดยอดค่าแรงรายเดือน ── */
const monthOf = (d) => String(d).slice(0, 7);
const monthEnd = (period) => {
  const [y, m] = period.split("-").map(Number);
  return `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};
const thMonth = (period) => { const [y, m] = period.split("-").map(Number); return `${THMON[m - 1]} ${y + 543}`; };
const prNo = (period) => { const [y, m] = period.split("-").map(Number); return `PR-${String(y + 543).slice(2)}${String(m).padStart(2, "0")}`; };

const TKEY = { qty: "tq", rate: "tr", amt: "ta" };
const blankRow = (vendor) => ({ qty: "", rate: "", amt: "", tq: false, tr: false, ta: false, vendor, pay: "" });
const freshDay = () => ({ rows: {}, rev: { cash: "", transfer: "", grab: "", thai: "" }, cashOpen: "", cashCount: "", closed: false });

/* หัวใจของ v15 — ระบบแก้ได้เฉพาะช่องที่ตัวเองเป็นเจ้าของ (เหมือนเดิม ไม่เปลี่ยน) */
const recalc = (r) => {
  if (!r.ta) {
    r.amt = has(r.qty) && has(r.rate) ? s2(A(r.qty) * A(r.rate)) : "";
  } else if (!r.tr) {
    if (has(r.qty) && A(r.qty) !== 0) r.rate = s2(A(r.amt) / A(r.qty));
  }
  return r;
};
const isConflict = (r) =>
  r.tq && r.tr && r.ta && has(r.qty) && has(r.rate) && has(r.amt) &&
  Math.abs(A(r.qty) * A(r.rate) - A(r.amt)) > 0.005;

const THRESHOLD = 0.10;

/* ═══════════════════════════════════════════════════════════
   ═══════════ ชั้นเก็บข้อมูล — Supabase ═══════════
   แทนที่ localStorage เดิมทั้งหมด ต้องต่อเน็ตเวลาใช้งาน
   ═══════════════════════════════════════════════════════════ */
const REV_CHANNEL_DB = { cash: "cash", transfer: "transfer", grab: "grab", thai: "thaichuaithai" };
const REV_CHANNEL_APP = { cash: "cash", transfer: "transfer", grab: "grab", thaichuaithai: "thai" };

async function fetchCatalog() {
  const { data, error } = await supabase.from("items")
    .select("id,account_code,name,unit,default_vendor_name,is_active")
    .eq("entity", ENTITY).order("name");
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    cat: CAT_BY_CODE[r.account_code] || "meat",
    unit: r.unit,
    vendor: r.default_vendor_name || "—",
    off: !r.is_active,
  }));
}

async function fetchVendors() {
  const { data, error } = await supabase.from("stores").select("name,default_payment_method").eq("entity", ENTITY);
  if (error) throw error;
  const v = {};
  data.forEach((r) => { v[r.name] = DB2PAY[r.default_payment_method] || "cash"; });
  return v;
}

async function fetchGrabPct() {
  const { data, error } = await supabase.from("settings").select("grab_commission_pct").eq("entity", ENTITY).maybeSingle();
  if (error) throw error;
  return data ? String(data.grab_commission_pct) : "10";
}

async function fetchDay(date) {
  const [pr, sr, cr] = await Promise.all([
    supabase.from("daily_purchases")
      .select("item_id,qty,unit_price,amount,qty_manual,price_manual,amount_manual,vendor_name,payment_method_override")
      .eq("entity", ENTITY).eq("purchase_date", date),
    supabase.from("daily_sales").select("channel,amount").eq("entity", ENTITY).eq("sale_date", date),
    supabase.from("cash_counts").select("opening_cash,counted_cash,is_closed")
      .eq("entity", ENTITY).eq("count_date", date).maybeSingle(),
  ]);
  if (pr.error) throw pr.error;
  if (sr.error) throw sr.error;
  if (cr.error) throw cr.error;

  const rows = {};
  (pr.data || []).forEach((p) => {
    rows[p.item_id] = {
      qty: p.qty != null ? String(p.qty) : "",
      rate: p.unit_price != null ? String(p.unit_price) : "",
      amt: p.amount != null ? String(p.amount) : "",
      tq: !!p.qty_manual, tr: !!p.price_manual, ta: !!p.amount_manual,
      vendor: p.vendor_name || "—",
      pay: p.payment_method_override ? (DB2PAY[p.payment_method_override] || "") : "",
    };
  });
  const rev = { cash: "", transfer: "", grab: "", thai: "" };
  (sr.data || []).forEach((s) => {
    const k = REV_CHANNEL_APP[s.channel];
    if (k) rev[k] = s.amount != null ? String(s.amount) : "";
  });
  const cash = cr.data;
  return {
    rows, rev,
    cashOpen: cash && cash.opening_cash != null ? String(cash.opening_cash) : "",
    cashCount: cash && cash.counted_cash != null ? String(cash.counted_cash) : "",
    closed: !!(cash && cash.is_closed),
  };
}

async function fetchPrevOf(date, catalog) {
  const { data, error } = await supabase.rpc("get_prev_purchases", { p_entity: ENTITY, p_date: date });
  if (error) throw error;
  const byItem = {};
  (data || []).forEach((r) => { byItem[r.item_id] = r; });
  const map = {};
  catalog.forEach((it) => {
    const r = byItem[it.id];
    map[it.id] = r
      ? { rate: String(r.unit_price), qty: String(r.qty || ""), vendor: r.vendor_name || it.vendor,
          pay: r.payment_method_override ? (DB2PAY[r.payment_method_override] || "") : "", when: r.purchase_date }
      : { rate: "", qty: "", vendor: it.vendor, pay: "", when: null };
  });
  return map;
}

async function fetchPrevCash(date) {
  const { data, error } = await supabase.from("cash_counts").select("counted_cash,count_date")
    .eq("entity", ENTITY).lt("count_date", date).not("counted_cash", "is", null)
    .order("count_date", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? { v: String(data.counted_cash), when: data.count_date } : null;
}

async function fetchSavedDatesSummary() {
  const [pr, sr, cr] = await Promise.all([
    supabase.from("daily_purchases").select("purchase_date,amount").eq("entity", ENTITY),
    supabase.from("daily_sales").select("sale_date,amount").eq("entity", ENTITY),
    supabase.from("cash_counts").select("count_date,is_closed").eq("entity", ENTITY),
  ]);
  if (pr.error) throw pr.error;
  if (sr.error) throw sr.error;
  if (cr.error) throw cr.error;
  const map = {};
  const get = (d) => (map[d] || (map[d] = { d, inn: 0, outn: 0, closed: false }));
  (pr.data || []).forEach((r) => { get(r.purchase_date).outn += A(r.amount); });
  (sr.data || []).forEach((r) => { get(r.sale_date).inn += A(r.amount); });
  (cr.data || []).forEach((r) => { get(r.count_date).closed = !!r.is_closed; });
  return Object.values(map).sort((a, b) => (a.d < b.d ? 1 : -1));
}

async function deleteDayDB(date) {
  await Promise.all([
    supabase.from("daily_purchases").delete().eq("entity", ENTITY).eq("purchase_date", date),
    supabase.from("daily_sales").delete().eq("entity", ENTITY).eq("sale_date", date),
    supabase.from("cash_counts").delete().eq("entity", ENTITY).eq("count_date", date),
    supabase.from("staff_attendance").delete().eq("entity", ENTITY).eq("work_date", date),
    supabase.from("staff_advances").delete().eq("entity", ENTITY).eq("advance_date", date),
    supabase.from("journal_entries").delete().eq("entity", ENTITY).eq("entry_date", date),
  ]);
}

/* ── เผื่อกดลบผิด: ก่อนลบจริงให้ดึงข้อมูลทั้งวันมาเก็บไว้ก่อน แล้วค่อยลบ ── */
async function fetchDayRaw(date) {
  const [pr, sr, cr, jer, ar, adv] = await Promise.all([
    supabase.from("daily_purchases").select("*").eq("entity", ENTITY).eq("purchase_date", date),
    supabase.from("daily_sales").select("*").eq("entity", ENTITY).eq("sale_date", date),
    supabase.from("cash_counts").select("*").eq("entity", ENTITY).eq("count_date", date),
    supabase.from("journal_entries").select("*, journal_lines(*)").eq("entity", ENTITY).eq("entry_date", date),
    supabase.from("staff_attendance").select("*").eq("entity", ENTITY).eq("work_date", date),
    supabase.from("staff_advances").select("*").eq("entity", ENTITY).eq("advance_date", date),
  ]);
  if (pr.error) throw pr.error;
  if (sr.error) throw sr.error;
  if (cr.error) throw cr.error;
  if (jer.error) throw jer.error;
  if (ar.error) throw ar.error;
  if (adv.error) throw adv.error;
  return {
    purchases: pr.data || [], sales: sr.data || [], cash: cr.data || [], journals: jer.data || [],
    attendance: ar.data || [], advances: adv.data || [],
  };
}

/* กู้คืนข้อมูลที่เพิ่งลบไป (เลิกทำ) — เขียนแถวเดิมกลับเข้าไปด้วย id เดิม
   ใส่ journal_entries/journal_lines ก่อน กันกรณีตารางอื่นอ้างอิง journal_entry_id อยู่ */
async function restoreDayDB(snapshot) {
  const { purchases, sales, cash, journals, attendance = [], advances = [] } = snapshot;
  for (const je of journals) {
    const { journal_lines, ...entry } = je;
    const { error: e1 } = await supabase.from("journal_entries").insert(entry);
    if (e1) throw e1;
    if (journal_lines && journal_lines.length) {
      const { error: e2 } = await supabase.from("journal_lines").insert(journal_lines);
      if (e2) throw e2;
    }
  }
  if (purchases.length) { const { error } = await supabase.from("daily_purchases").insert(purchases); if (error) throw error; }
  if (sales.length) { const { error } = await supabase.from("daily_sales").insert(sales); if (error) throw error; }
  if (cash.length) { const { error } = await supabase.from("cash_counts").insert(cash); if (error) throw error; }
  if (attendance.length) { const { error } = await supabase.from("staff_attendance").insert(attendance); if (error) throw error; }
  if (advances.length) { const { error } = await supabase.from("staff_advances").insert(advances); if (error) throw error; }
}

async function saveRowDB(date, itemId, r) {
  const payload = {
    entity: ENTITY, purchase_date: date, item_id: itemId,
    qty: has(r.qty) ? A(r.qty) : null,
    unit_price: has(r.rate) ? A(r.rate) : null,
    amount: has(r.amt) ? A(r.amt) : null,
    qty_manual: !!r.tq, price_manual: !!r.tr, amount_manual: !!r.ta,
    vendor_name: r.vendor || "—",
    payment_method_override: r.pay ? PAY2DB[r.pay] : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("daily_purchases").upsert(payload, { onConflict: "entity,purchase_date,item_id" });
  if (error) throw error;
}

async function saveRevDB(date, channel, amount, grabPct) {
  const payload = { entity: ENTITY, sale_date: date, channel: REV_CHANNEL_DB[channel], amount: A(amount) };
  if (channel === "grab") {
    payload.commission_pct = A(grabPct);
    payload.commission_amount = r2(A(amount) * A(grabPct) / 100);
  }
  const { error } = await supabase.from("daily_sales").upsert(payload, { onConflict: "entity,sale_date,channel" });
  if (error) throw error;
}

async function saveCashDB(date, patch) {
  const payload = { entity: ENTITY, count_date: date, ...patch };
  const { error } = await supabase.from("cash_counts").upsert(payload, { onConflict: "entity,count_date" });
  if (error) throw error;
}

async function upsertItemDB(it) {
  const account_code = CATS[it.cat].code;
  const payload = { entity: ENTITY, account_code, name: it.name, unit: it.unit, default_vendor_name: it.vendor, is_active: !it.off };
  if (typeof it.id === "string" && it.id.includes("-")) {
    const { error } = await supabase.from("items").update(payload).eq("id", it.id);
    if (error) throw error;
    return it.id;
  }
  const { data, error } = await supabase.from("items").insert(payload).select("id").single();
  if (error) throw error;
  return data.id;
}

async function upsertVendorDB(name, payKey) {
  const { error } = await supabase.from("stores")
    .upsert({ entity: ENTITY, name, default_payment_method: PAY2DB[payKey] || "cash" }, { onConflict: "entity,name" });
  if (error) throw error;
}

async function setGrabPctDB(pct) {
  const { error } = await supabase.from("settings")
    .upsert({ entity: ENTITY, grab_commission_pct: A(pct) }, { onConflict: "entity" });
  if (error) throw error;
}

/* ═══════════════════════════════════════════════════════════
   ═══════════ พนักงาน · ค่าแรง · เงินเบิกล่วงหน้า ═══════════
   คนรายวัน  : เช็คชื่อ → ลงค่าแรงและจ่ายสดวันนั้นเลย
   คนรายเดือน: ไม่ต้องเช็คชื่อ → ลงค่าแรงตอนปิดยอดสิ้นเดือน
   เงินเบิกล่วงหน้า: ยังไม่ใช่ค่าแรง เก็บเป็นลูกหนี้ 1032-LS จนกว่าจะหักคืนสิ้นเดือน
   ═══════════════════════════════════════════════════════════ */
async function fetchEmployees() {
  const { data, error } = await supabase.from("employees")
    .select("id,name,pay_type,rate,is_active").eq("entity", ENTITY).order("name");
  if (error) throw error;
  return data || [];
}

async function upsertEmployeeDB(e) {
  const payload = { entity: ENTITY, name: e.name, pay_type: e.pay_type, rate: A(e.rate), is_active: e.is_active !== false };
  if (e.id) {
    const { error } = await supabase.from("employees").update(payload).eq("id", e.id);
    if (error) throw error;
    return e.id;
  }
  const { data, error } = await supabase.from("employees").insert(payload).select("id").single();
  if (error) throw error;
  return data.id;
}

async function fetchAttendance(date) {
  const { data, error } = await supabase.from("staff_attendance")
    .select("employee_id,amount").eq("entity", ENTITY).eq("work_date", date);
  if (error) throw error;
  const m = {};
  (data || []).forEach((r) => { m[r.employee_id] = r.amount != null ? String(r.amount) : ""; });
  return m;
}

async function saveAttendanceDB(date, employeeId, amount) {
  const { error } = await supabase.from("staff_attendance").upsert(
    { entity: ENTITY, work_date: date, employee_id: employeeId, amount: A(amount), updated_at: new Date().toISOString() },
    { onConflict: "entity,work_date,employee_id" });
  if (error) throw error;
}

async function removeAttendanceDB(date, employeeId) {
  const { error } = await supabase.from("staff_attendance").delete()
    .eq("entity", ENTITY).eq("work_date", date).eq("employee_id", employeeId);
  if (error) throw error;
}

/* ค่าแรงรายวันที่เช็คชื่อไว้ทั้งเดือน (ใช้โชว์ตอนปิดยอดเดือน — จ่ายไปแล้วรายวัน ไม่ลงซ้ำ) */
async function fetchAttendanceMonth(period) {
  const { data, error } = await supabase.from("staff_attendance")
    .select("employee_id,amount").eq("entity", ENTITY)
    .gte("work_date", period + "-01").lte("work_date", monthEnd(period));
  if (error) throw error;
  const m = {};
  (data || []).forEach((r) => { m[r.employee_id] = r2((m[r.employee_id] || 0) + A(r.amount)); });
  return m;
}

async function fetchAdvancesOnDate(date) {
  const { data, error } = await supabase.from("staff_advances")
    .select("id,employee_id,amount,payment_method")
    .eq("entity", ENTITY).eq("advance_date", date).order("created_at");
  if (error) throw error;
  return data || [];
}

/* เงินเบิกที่ยังไม่ได้หักคืน (ทุกวัน ทุกเดือน) — ใช้เตือนและตั้งยอดหักตอนปิดเดือน */
async function fetchOpenAdvances() {
  const { data, error } = await supabase.from("staff_advances")
    .select("id,employee_id,advance_date,amount")
    .eq("entity", ENTITY).is("settled_period", null).order("advance_date");
  if (error) throw error;
  return data || [];
}

async function addAdvanceDB(date, employeeId, amount, method) {
  const { data, error } = await supabase.from("staff_advances")
    .insert({ entity: ENTITY, advance_date: date, employee_id: employeeId, amount: A(amount), payment_method: method || "cash" })
    .select("id,employee_id,amount,payment_method").single();
  if (error) throw error;
  return data;
}

async function removeAdvanceDB(id) {
  const { error } = await supabase.from("staff_advances").delete().eq("id", id);
  if (error) throw error;
}

async function fetchPayrollMonth(period) {
  const { data, error } = await supabase.from("payroll_months")
    .select("employee_id,wage_amount,advance_deducted,net_paid,payment_method,is_closed")
    .eq("entity", ENTITY).eq("period", period);
  if (error) throw error;
  const m = {};
  (data || []).forEach((r) => { m[r.employee_id] = r; });
  return m;
}

async function savePayrollRowDB(period, employeeId, row) {
  const { error } = await supabase.from("payroll_months").upsert({
    entity: ENTITY, period, employee_id: employeeId,
    wage_amount: A(row.wage), advance_deducted: A(row.ded), net_paid: r2(A(row.wage) - A(row.ded)),
    payment_method: row.method || "cash", is_closed: !!row.closed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "entity,period,employee_id" });
  if (error) throw error;
}

/* ปิดยอดค่าแรงเดือน — เขียนใบสำคัญ PR-YYMM ลงวันสุดท้ายของเดือน แล้วตัดเงินเบิกที่หักคืนแล้ว */
async function closePayrollDB(period, rows, journal) {
  const dateEnd = monthEnd(period);
  await supabase.from("journal_entries").delete()
    .eq("entity", ENTITY).eq("entry_date", dateEnd).eq("source_type", "payroll");
  if (journal && journal.lines.length) {
    const { data: entry, error: e1 } = await supabase.from("journal_entries")
      .insert({ entity: ENTITY, entry_date: dateEnd, voucher_no: journal.no, description: journal.title, source_type: "payroll" })
      .select("id").single();
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("journal_lines")
      .insert(journal.lines.map((l) => ({ entry_id: entry.id, account_code: l.code, debit: l.dr, credit: l.cr })));
    if (e2) throw e2;
  }
  for (const r of rows) {
    await savePayrollRowDB(period, r.id, { ...r, closed: true });
    if (r.advIds && r.advIds.length) {
      const { error } = await supabase.from("staff_advances").update({ settled_period: period }).in("id", r.advIds);
      if (error) throw error;
    }
  }
}

/* บันทึกสมุดรายวัน (journal_entries/journal_lines) ตอนกด "ปิดยอดวันนี้" — ลบของเดิมวันนั้นแล้วเขียนใหม่ เพื่อให้ตรงกับหน้าจอเสมอ */
async function saveJournalsDB(date, journals) {
  /* ลบเฉพาะใบสำคัญของ "รายวัน" — ใบค่าแรงรายเดือน (payroll) ที่ลงวันสุดท้ายของเดือนต้องไม่ถูกลบทิ้ง */
  await supabase.from("journal_entries").delete()
    .eq("entity", ENTITY).eq("entry_date", date).neq("source_type", "payroll");
  for (const j of journals) {
    const sourceType = j.no.endsWith("-A") ? "sales"
      : j.no.endsWith("-F") ? "staff_advance"
      : /ค้างจ่ายร้านก๋วยเตี๋ยว|ก๋วยเตี๋ยว/.test(j.title) ? "received_from_ns"
      : /ซื้อเชื่อ/.test(j.title) ? "purchase_credit"
      : /จ่ายโอน/.test(j.title) ? "purchase_transfer"
      : "purchase_cash";
    const { data: entry, error: eErr } = await supabase.from("journal_entries")
      .insert({ entity: ENTITY, entry_date: date, voucher_no: j.no, description: j.title, source_type: sourceType })
      .select("id").single();
    if (eErr) throw eErr;
    const lines = j.lines.map((l) => ({ entry_id: entry.id, account_code: l.code, debit: l.dr, credit: l.cr }));
    const { error: lErr } = await supabase.from("journal_lines").insert(lines);
    if (lErr) throw lErr;
  }
}

/* ═══════════════════════════════════════════════════════════ */
function LoadingScreen({ text }) {
  return (
    <div style={{ fontFamily: "Sarabun,system-ui,sans-serif", color: "#6B7C72", padding: "40px 20px", textAlign: "center", fontSize: 15 }}>
      {text}
    </div>
  );
}

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) setErr(error.message === "Invalid login credentials" ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง" : error.message);
    setBusy(false);
  };

  return (
    <div style={{ maxWidth: 340, margin: "60px auto", fontFamily: "Sarabun,system-ui,sans-serif", color: "#1E2A24" }}>
      <h1 style={{ fontSize: 19, marginBottom: 4 }}>ร้านอีสาน/ลาบ</h1>
      <p style={{ fontSize: 12.5, color: "#6B7C72", marginTop: 0, marginBottom: 20 }}>เข้าสู่ระบบเพื่อบันทึกรายวัน · สาขา LS</p>
      <form onSubmit={submit}>
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>อีเมล</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", padding: 9, marginBottom: 12, border: "1px solid #C9DCC8", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
        <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>รหัสผ่าน</label>
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 9, marginBottom: 14, border: "1px solid #C9DCC8", borderRadius: 4, fontSize: 14, boxSizing: "border-box" }} />
        {err && <p style={{ color: "#A8443A", fontSize: 12.5, marginTop: -6, marginBottom: 12 }}>{err}</p>}
        <button type="submit" disabled={busy}
          style={{ width: "100%", padding: 11, border: "none", borderRadius: 4, background: "#1E2A24", color: "#FBFAF6", fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
      <p style={{ fontSize: 11.5, color: "#6B7C72", marginTop: 18, lineHeight: 1.6 }}>
        ยังไม่มีบัญชี — ให้บอสหนึ่งสร้างให้ผ่าน Supabase Dashboard (Authentication → Users → Add user)
      </p>
    </div>
  );
}

export default function LaabEntryV15() {
  const [session, setSession] = useState(undefined); // undefined = กำลังเช็ค · null = ยังไม่ล็อกอิน · object = ล็อกอินแล้ว

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <LoadingScreen text="กำลังตรวจสอบการเข้าสู่ระบบ…" />;
  if (!session) return <LoginScreen />;
  return <LaabEntryApp userEmail={session.user.email} />;
}

/* ═══════════════════════════════════════════════════════════ */
function LaabEntryApp({ userEmail }) {
  const [bootReady, setBootReady] = useState(false);
  const [bootError, setBootError] = useState("");
  const [catalog, setCatalogState] = useState([]);
  const [vendors, setVendorsState] = useState({});
  const [grabPct, setGrabPctState] = useState("10");

  const [date, setDate] = useState(todayISO());
  const [dayLoading, setDayLoading] = useState(true);
  const [day, setDayState] = useState(freshDay());
  const [prevOf, setPrevOf] = useState({});
  const [prevCash, setPrevCash] = useState(null);

  /* ── พนักงาน · ค่าแรง · เงินเบิกล่วงหน้า ── */
  const [employees, setEmployeesState] = useState([]);
  const [att, setAttState] = useState({});        // employee_id → ยอดค่าแรงวันนี้ (string)
  const [advToday, setAdvToday] = useState([]);   // เงินเบิกที่เบิกในวันที่เลือก
  const [openAdv, setOpenAdv] = useState([]);     // เงินเบิกที่ยังไม่ได้หักคืน (ทุกวัน)
  const [showStaff, setShowStaff] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);
  const [payPeriod, setPayPeriod] = useState(monthOf(todayISO()));
  const [payData, setPayData] = useState(null);   // { rows, saved, attMonth }
  const [advFor, setAdvFor] = useState("");
  const [advAmt, setAdvAmt] = useState("");
  const [advPay, setAdvPay] = useState("cash");
  const [en, setEn] = useState(""); const [ep, setEp] = useState("daily"); const [er, setEr] = useState("");

  const [remoteChanged, setRemoteChanged] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pendingSaves, setPendingSaves] = useState(0);
  const [undoState, setUndoState] = useState(null); // { date, snapshot } — เผื่อกดลบผิดจากหน้า "วันที่บันทึกไว้"
  const undoTimerRef = useRef(null);

  /* ── โหลดผังของ/ร้าน/ค่าคอม ครั้งแรกหลังล็อกอิน ── */
  useEffect(() => {
    (async () => {
      try {
        const [c, v, g, emp, oa] = await Promise.all([
          fetchCatalog(), fetchVendors(), fetchGrabPct(), fetchEmployees(), fetchOpenAdvances(),
        ]);
        setCatalogState(c); setVendorsState(v); setGrabPctState(g);
        setEmployeesState(emp); setOpenAdv(oa);
        setBootReady(true);
      } catch (e) {
        setBootError(String((e && e.message) || e));
      }
    })();
  }, []);

  /* ── โหลดข้อมูลวันที่เลือก ── */
  const loadDay = useCallback(async (d, cat) => {
    setDayLoading(true);
    try {
      const [dd, po, pc, at, ad] = await Promise.all([
        fetchDay(d), fetchPrevOf(d, cat), fetchPrevCash(d), fetchAttendance(d), fetchAdvancesOnDate(d),
      ]);
      setDayState(dd); setPrevOf(po); setPrevCash(pc); setAttState(at); setAdvToday(ad);
      setRemoteChanged(false);
    } catch (e) {
      setSaveError("โหลดข้อมูลวันที่ " + d + " ไม่สำเร็จ: " + String((e && e.message) || e));
    } finally {
      setDayLoading(false);
    }
  }, []);

  useEffect(() => { if (bootReady) loadDay(date, catalog); }, [bootReady, date]); // eslint-disable-line

  /* ── ฟังการเปลี่ยนแปลงจากเครื่องอื่นแบบเรียลไทม์ — ไม่เขียนทับของที่กำลังพิมพ์อยู่ แค่ขึ้นแจ้งให้กดโหลดใหม่ ── */
  useEffect(() => {
    if (!bootReady) return;
    const ch = supabase.channel("laab-ls-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_purchases", filter: `entity=eq.${ENTITY}` }, () => setRemoteChanged(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_sales", filter: `entity=eq.${ENTITY}` }, () => setRemoteChanged(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "cash_counts", filter: `entity=eq.${ENTITY}` }, () => setRemoteChanged(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_attendance", filter: `entity=eq.${ENTITY}` }, () => setRemoteChanged(true))
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_advances", filter: `entity=eq.${ENTITY}` }, () => setRemoteChanged(true))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [bootReady]);

  const savedDates = useMemo(() => [], []); // ใช้ showDays panel โหลดเองแยก (ด้านล่าง)

  const track = (p) => { setPendingSaves((n) => n + 1); p.catch((e) => setSaveError(String((e && e.message) || e))).finally(() => setPendingSaves((n) => Math.max(0, n - 1))); };

  const setRows = (fn) => setDayState((d) => ({ ...d, rows: typeof fn === "function" ? fn(d.rows) : fn }));
  const setRev = (fn) => setDayState((d) => ({ ...d, rev: typeof fn === "function" ? fn(d.rev) : fn }));
  const rev = day.rev;
  const setCashOpen = (v) => { setDayState((d) => ({ ...d, cashOpen: v })); track(saveCashDB(date, { opening_cash: has(v) ? A(v) : null })); };
  const setCashCount = (v) => { setDayState((d) => ({ ...d, cashCount: v })); track(saveCashDB(date, { counted_cash: has(v) ? A(v) : null })); };
  const setClosed = (v) => { setDayState((d) => ({ ...d, closed: v })); track(saveCashDB(date, { is_closed: v })); };

  const setGrabPct = (v) => { setGrabPctState(v); track(setGrabPctDB(v)); };

  /* ── เช็คชื่อคนมาทำงาน (คนรายวัน) ── */
  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);
  const dailyEmps = useMemo(() => employees.filter((e) => e.is_active && e.pay_type === "daily"), [employees]);
  const monthlyEmps = useMemo(() => employees.filter((e) => e.is_active && e.pay_type === "monthly"), [employees]);

  const toggleAtt = (e) => {
    const on = att[e.id] !== undefined;
    if (on) {
      setAttState((p) => { const n = { ...p }; delete n[e.id]; return n; });
      track(removeAttendanceDB(date, e.id));
    } else {
      const v = s2(A(e.rate));
      setAttState((p) => ({ ...p, [e.id]: v }));
      track(saveAttendanceDB(date, e.id, v));
    }
    dirty();
  };
  const editAtt = (id, raw) => {
    const v = numStr(raw);
    setAttState((p) => ({ ...p, [id]: v }));
    dirty();
    track(saveAttendanceDB(date, id, v));
  };

  /* ── เงินเบิกล่วงหน้า ── */
  const addAdvance = () => {
    if (!advFor || !has(advAmt) || A(advAmt) <= 0) return;
    const empId = advFor, amt = advAmt, method = advPay;
    setAdvFor(""); setAdvAmt("");
    dirty();
    track((async () => {
      const row = await addAdvanceDB(date, empId, amt, method);
      setAdvToday((p) => [...p, row]);
      setOpenAdv(await fetchOpenAdvances());
    })());
  };
  const delAdvance = (id) => {
    setAdvToday((p) => p.filter((a) => a.id !== id));
    dirty();
    track((async () => { await removeAdvanceDB(id); setOpenAdv(await fetchOpenAdvances()); })());
  };
  const owedBy = (empId) => r2(openAdv.filter((a) => a.employee_id === empId).reduce((s, a) => s + A(a.amount), 0));

  /* ── ทะเบียนพนักงาน ── */
  const addEmployee = () => {
    const name = en.trim();
    if (!name) return;
    const draft = { name, pay_type: ep, rate: A(er), is_active: true };
    setEn(""); setEr("");
    track((async () => {
      const id = await upsertEmployeeDB(draft);
      setEmployeesState((p) => [...p, { ...draft, id }].sort((a, b) => a.name.localeCompare(b.name, "th")));
    })());
  };
  const patchEmployee = (id, patch) => {
    let updated = null;
    setEmployeesState((p) => p.map((e) => { if (e.id !== id) return e; updated = { ...e, ...patch }; return updated; }));
    if (updated) track(upsertEmployeeDB(updated));
  };

  /* ── ปิดยอดค่าแรงรายเดือน ── */
  const openPayroll = async (period) => {
    const p = period || payPeriod;
    setPayPeriod(p); setShowPayroll(true); setPayData(null);
    try {
      const [saved, attMonth] = await Promise.all([fetchPayrollMonth(p), fetchAttendanceMonth(p)]);
      const rows = employees.filter((e) => e.is_active).map((e) => {
        const s = saved[e.id];
        const owed = owedBy(e.id);
        const wage = s ? String(s.wage_amount)
          : e.pay_type === "monthly" ? s2(A(e.rate)) : s2(attMonth[e.id] || 0);
        const ded = s ? String(s.advance_deducted) : s2(e.pay_type === "monthly" ? Math.min(owed, A(wage)) : 0);
        return { id: e.id, wage, ded, method: (s && s.payment_method) || "cash", closed: !!(s && s.is_closed) };
      });
      setPayData({ rows, attMonth });
    } catch (e) {
      setSaveError(String((e && e.message) || e));
    }
  };
  const editPay = (id, field, raw) => {
    setPayData((d) => d && ({ ...d, rows: d.rows.map((r) => (r.id === id ? { ...r, [field]: numStr(raw) } : r)) }));
  };

  /* เงินเบิกที่จะถูกตัดออกตอนปิดยอด — ตัดใบเก่าก่อน เท่าที่ยอดหักครอบคลุมเต็มใบ */
  const advIdsFor = (empId, ded) => {
    let left = A(ded); const ids = [];
    openAdv.filter((a) => a.employee_id === empId).forEach((a) => {
      if (A(a.amount) <= left + 0.005) { ids.push(a.id); left = r2(left - A(a.amount)); }
    });
    return ids;
  };

  /* หักเงินเบิกได้เฉพาะคนรายเดือน (คนรายวันรับเงินครบทุกวันแล้ว ไม่มีค่าแรงค้างให้หัก)
     ถ้าคิดยอดหักของคนรายวันเข้าไปด้วย ใบสำคัญจะไม่สมดุล */
  const payTotals = useMemo(() => {
    if (!payData) return null;
    const paid = payData.rows.filter((r) => empById[r.id] && empById[r.id].pay_type === "monthly");
    const wage = r2(paid.reduce((s, r) => s + A(r.wage), 0));
    const ded = r2(paid.reduce((s, r) => s + A(r.ded), 0));
    const cash = r2(paid.filter((r) => r.method === "cash").reduce((s, r) => s + A(r.wage) - A(r.ded), 0));
    const bank = r2(paid.filter((r) => r.method !== "cash").reduce((s, r) => s + A(r.wage) - A(r.ded), 0));
    return { wage, ded, cash, bank, net: r2(wage - ded) };
  }, [payData, empById]);

  const payJournal = useMemo(() => {
    if (!payTotals || !payTotals.wage) return null;
    const lines = [{ code: "6010-LS", dr: payTotals.wage, cr: 0 }];
    if (payTotals.ded) lines.push({ code: "1032-LS", dr: 0, cr: payTotals.ded });
    if (payTotals.cash) lines.push({ code: "1010-LS", dr: 0, cr: payTotals.cash });
    if (payTotals.bank) lines.push({ code: "1020-LS", dr: 0, cr: payTotals.bank });
    return { no: prNo(payPeriod), title: `ค่าแรงพนักงานรายเดือน ${thMonth(payPeriod)}`, lines };
  }, [payTotals, payPeriod]);

  const closePayroll = () => {
    if (!payData) return;
    if (!window.confirm(`ปิดยอดค่าแรงเดือน ${thMonth(payPeriod)} ? เงินเบิกที่หักคืนจะถูกตัดออกจากยอดค้าง`)) return;
    const rows = payData.rows
      .filter((r) => empById[r.id] && empById[r.id].pay_type === "monthly")
      .map((r) => ({ ...r, advIds: advIdsFor(r.id, r.ded) }));
    track((async () => {
      await closePayrollDB(payPeriod, rows, payJournal);
      setOpenAdv(await fetchOpenAdvances());
      setPayData((d) => d && ({ ...d, rows: d.rows.map((r) => ({ ...r, closed: true })) }));
    })());
  };

  const setCatalog = (fn) => setCatalogState((p) => (typeof fn === "function" ? fn(p) : fn));
  const setVendors = (fn) => setVendorsState((p) => (typeof fn === "function" ? fn(p) : fn));

  const cashOpen = has(day.cashOpen) ? day.cashOpen : (prevCash ? prevCash.v : "");
  const cashOpenAuto = !has(day.cashOpen) && !!prevCash;
  const cashCount = day.cashCount;

  const [open, setOpen] = useState({ meat: true, wage: true, meal: true });
  const [compare, setCompare] = useState(null);
  const [newFor, setNewFor] = useState(null);
  const [nn, setNn] = useState(""); const [nu, setNu] = useState(""); const [nv, setNv] = useState("");
  const [q, setQ] = useState("");
  const [focusKey, setFocusKey] = useState(null);
  const [hi, setHi] = useState(null);
  const [copied, setCopied] = useState(false);
  const [resetNote, setResetNote] = useState("");
  const [showDays, setShowDays] = useState(false);
  const [daysSummary, setDaysSummary] = useState(null);
  const [editCat, setEditCat] = useState(null);

  const rowRef = useRef({});
  const taRef = useRef(null);
  const fileRef = useRef(null);

  /* ค่าล่าสุดของ day.rows แบบอ่านได้ทันที ไม่ต้องรอ React render — กันปัญหาบันทึกขึ้น Supabase ไม่ทัน
     ตอนพิมพ์เร็วๆ หรือมีการอัปเดตพร้อมกันหลายจุด (เดิมพึ่งพาจังหวะของ setState ซึ่งไม่การันตีว่าจะ sync เสมอ) */
  const rowsDataRef = useRef(day.rows);
  useEffect(() => { rowsDataRef.current = day.rows; }, [day.rows]);

  const closed = !!day.closed;

  /* แถวที่ยังไม่ถูกแตะ = ราคาเติมจากครั้งก่อน (เหมือนเดิม แค่ prevOf มาจาก Supabase แทนการสแกนในเครื่อง) */
  const R = (id) => {
    const r = day.rows[id];
    if (r) return r;
    const p = prevOf[id] || { rate: "", vendor: "—", pay: "" };
    const b = blankRow(p.vendor || "—");
    b.rate = p.rate || "";
    b.pay = p.pay || "";
    return b;
  };
  const dirty = () => { setCopied(false); setResetNote(""); };

  /* ── แก้ค่าในช่อง ── */
  const edit = (id, field, raw) => {
    const v = numStr(raw);
    const seed = R(id);
    const r = { ...(rowsDataRef.current[id] || seed), [field]: v };
    r[TKEY[field]] = v !== "";
    const rr = recalc(r);
    rowsDataRef.current = { ...rowsDataRef.current, [id]: rr };
    setRows(() => rowsDataRef.current);
    dirty();
    track(saveRowDB(date, id, rr));
  };

  const resolve = (id, keep) => {
    const seed = R(id);
    const r = { ...(rowsDataRef.current[id] || seed) };
    if (keep === "amt") r.tr = false; else r.ta = false;
    const rr = recalc(r);
    rowsDataRef.current = { ...rowsDataRef.current, [id]: rr };
    setRows(() => rowsDataRef.current);
    dirty();
    track(saveRowDB(date, id, rr));
  };

  const setVend = (id, v) => {
    const name = v.trim() || "—";
    const seed = R(id);
    if (!vendors[name]) { setVendors((p) => ({ ...p, [name]: "cash" })); track(upsertVendorDB(name, "cash")); }
    const saved = { ...(rowsDataRef.current[id] || seed), vendor: name };
    rowsDataRef.current = { ...rowsDataRef.current, [id]: saved };
    setRows(() => rowsDataRef.current);
    dirty();
    track(saveRowDB(date, id, saved));
  };
  const setPay = (id, v) => {
    const seed = R(id);
    const saved = { ...(rowsDataRef.current[id] || seed), pay: v };
    rowsDataRef.current = { ...rowsDataRef.current, [id]: saved };
    setRows(() => rowsDataRef.current);
    dirty();
    track(saveRowDB(date, id, saved));
  };
  const payOf = (r) => r.pay || vendors[r.vendor] || "cash";

  const show = (id, field) => {
    const v = R(id)[field];
    if (!has(v)) return "";
    if (focusKey === id + ":" + field) return v;
    return dec(A(v));
  };
  const fProps = (id, field) => ({
    onFocus: () => setFocusKey(id + ":" + field),
    onBlur: () => setFocusKey((k) => (k === id + ":" + field ? null : k)),
  });

  const resetRates = () => {
    const locked = catalog.filter((it) => prevOf[it.id] && prevOf[it.id].rate && R(it.id).ta && R(it.id).tq);
    const toSave = [];
    const o = { ...rowsDataRef.current };
    catalog.forEach((it) => {
      const pv = prevOf[it.id];
      const pr = pv && pv.rate;
      if (!pr) return;
      const cur = o[it.id] || R(it.id);
      if (cur.ta && cur.tq) return;
      const rr = recalc({ ...cur, rate: pr, tr: false });
      o[it.id] = rr;
      toSave.push([it.id, rr]);
    });
    rowsDataRef.current = o;
    setRows(() => o);
    dirty();
    toSave.forEach(([id, r]) => track(saveRowDB(date, id, r)));
    setResetNote(locked.length
      ? `คืนราคาครั้งก่อนแล้ว — ข้าม ${locked.length} รายการที่พิมพ์ทั้งจำนวนและยอดรวมเอง (${locked.map((x) => x.name).join(", ")}) เพราะราคาต้องคิดจากยอดที่พิมพ์`
      : "");
  };

  const clearQty = () => {
    const toSave = [];
    const o = { ...rowsDataRef.current };
    catalog.forEach((it) => {
      const cur = o[it.id] || R(it.id);
      const rr = recalc({ ...cur, qty: "", tq: false, amt: "", ta: false });
      o[it.id] = rr;
      toSave.push([it.id, rr]);
    });
    rowsDataRef.current = o;
    setRows(() => o);
    dirty();
    toSave.forEach(([id, r]) => track(saveRowDB(date, id, r)));
  };

  const addItem = () => {
    const name = nn.trim();
    if (!name || !newFor) return;
    const vendor = nv.trim() || "—";
    const unit = nu.trim() || "ชิ้น";
    const cat = newFor;
    if (!vendors[vendor]) { setVendors((p) => ({ ...p, [vendor]: "cash" })); track(upsertVendorDB(vendor, "cash")); }
    setNn(""); setNu(""); setNv(""); dirty();
    /* รอรหัสจริงจาก Supabase ก่อนค่อยเอาเข้าหน้าจอ — กันไม่ให้ใช้รหัสชั่วคราวไปกรอกจำนวน/ราคาแล้วบันทึกไม่ได้ */
    track((async () => {
      const realId = await upsertItemDB({ cat, name, unit, vendor, off: false });
      const it = { id: realId, name, cat, unit, vendor, off: false };
      setCatalog((p) => [...p, it]);
      rowsDataRef.current = { ...rowsDataRef.current, [realId]: blankRow(vendor) };
      setRows(() => rowsDataRef.current);
    })());
  };

  const patchItem = (id, patch) => {
    let updated;
    setCatalog((p) => p.map((it) => { if (it.id !== id) return it; updated = { ...it, ...patch }; return updated; }));
    if (updated) track(upsertItemDB(updated));
    if (patch.vendor && !vendors[patch.vendor]) { setVendors((p) => ({ ...p, [patch.vendor]: "cash" })); track(upsertVendorDB(patch.vendor, "cash")); }
  };

  const active = useMemo(
    () => catalog.filter((it) => { const r = R(it.id); return A(r.amt) !== 0 || A(r.qty) !== 0; })
      .map((it) => ({ ...it, ...R(it.id) })),
    [catalog, day.rows, prevOf]);

  const pending = useMemo(
    () => catalog.filter((it) => { const r = R(it.id); return A(r.qty) !== 0 && !has(r.amt); }),
    [catalog, day.rows, prevOf]);

  const conflicts = useMemo(
    () => catalog.filter((it) => isConflict(R(it.id))), [catalog, day.rows, prevOf]);

  const inCat = (c) => catalog.filter((it) => it.cat === c && (!it.off || editCat === c));
  const catTotal = (c) => (c === "wage" ? wageToday : inCat(c).reduce((s, it) => s + A(R(it.id).amt), 0));
  const catCount = (c) => (c === "wage"
    ? Object.keys(att).length
    : inCat(c).filter((it) => A(R(it.id).qty) !== 0 || A(R(it.id).amt) !== 0).length);

  const priceFlag = (it) => {
    const pv = prevOf[it.id];
    if (!pv) return null;
    const y = A(pv.rate), now = A(R(it.id).rate);
    if (!y || !now || A(R(it.id).qty) === 0) return null;
    const d = (now - y) / y;
    if (Math.abs(d) < THRESHOLD) return null;
    return { up: d > 0, y, when: pv.when, txt: (Math.abs(d) * 100).toFixed(0) };
  };
  const flaggedCats = new Set(catalog.filter(priceFlag).map((it) => it.cat));
  const flagged = catalog.filter(priceFlag).length;
  const isOpen = (c) => (open[c] === undefined ? flaggedCats.has(c) : open[c]);
  const toggle = (c) => setOpen((p) => ({ ...p, [c]: !isOpen(c) }));

  const found = q.trim() ? catalog.filter((it) => it.name.includes(q.trim())).slice(0, 8) : [];
  const goTo = (it) => { setOpen((p) => ({ ...p, [it.cat]: true })); setQ(""); setHi(it.id); };

  useEffect(() => {
    if (!hi) return;
    const el = rowRef.current[hi];
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHi(null), 2200);
    return () => clearTimeout(t);
  }, [hi]);

  /* ── ตัวเลขรวม (สูตรเดิมทุกตัว ไม่เปลี่ยน) ── */
  const grabGross = A(rev.grab);
  const grabComm = r2(grabGross * A(grabPct) / 100);
  const grabNet = r2(grabGross - grabComm);
  const totalIn = r2(A(rev.cash) + A(rev.transfer) + grabGross + A(rev.thai));

  /* ค่าแรงรายวันจากการเช็คชื่อ — เป็นค่าใช้จ่ายและจ่ายสดวันนั้นเลย */
  const wageToday = r2(employees.reduce((s, e) => s + A(att[e.id]), 0));
  /* เงินเบิกล่วงหน้า — เงินออกจากลิ้นชักจริง แต่ยังไม่ใช่ค่าใช้จ่าย (เป็นลูกหนี้ 1032-LS) */
  const advCash = r2(advToday.filter((a) => a.payment_method === "cash").reduce((s, a) => s + A(a.amount), 0));
  const advBank = r2(advToday.filter((a) => a.payment_method !== "cash").reduce((s, a) => s + A(a.amount), 0));
  const advTotal = r2(advCash + advBank);

  const totalOut = r2(active.reduce((s, l) => s + A(l.amt), 0) + wageToday);
  const byGrp = (g) => r2(active.filter((l) => CATS[l.cat].grp === g).reduce((s, l) => s + A(l.amt), 0));
  const food = byGrp("food"), bevT = byGrp("bev"), labor = r2(byGrp("labor") + wageToday), ops = byGrp("ops");
  const prime = r2(food + bevT + labor);
  const nsTotal = r2(active.filter((l) => payOf(l) === "ns").reduce((s, l) => s + A(l.amt), 0));
  const cashPaid = r2(active.filter((l) => PAY[payOf(l)].out).reduce((s, l) => s + A(l.amt), 0) + wageToday + advCash);
  const profit = r2(totalIn - totalOut - grabComm);
  const cashShould = r2(A(cashOpen) + A(rev.cash) - cashPaid);
  const cashDiff = has(cashCount) ? r2(A(cashCount) - cashShould) : null;

  /* ── สมุดรายวัน (สูตรเดิมทุกจุด) ── */
  const journals = useMemo(() => {
    const no = jeNo(date), out = [];
    const revLines = [];
    if (A(rev.cash))     { revLines.push({ code: "1010-LS", dr: r2(A(rev.cash)), cr: 0 }); }
    if (A(rev.transfer)) { revLines.push({ code: "1020-LS", dr: r2(A(rev.transfer)), cr: 0 }); }
    if (grabGross)       { revLines.push({ code: "1030-LS", dr: grabNet, cr: 0 });
                           if (grabComm) revLines.push({ code: "6330-LS", dr: grabComm, cr: 0 }); }
    if (A(rev.thai))     { revLines.push({ code: "1031-LS", dr: r2(A(rev.thai)), cr: 0 }); }
    if (A(rev.cash))     revLines.push({ code: "4010-LS", dr: 0, cr: r2(A(rev.cash)) });
    if (A(rev.transfer)) revLines.push({ code: "4020-LS", dr: 0, cr: r2(A(rev.transfer)) });
    if (grabGross)       revLines.push({ code: "4030-LS", dr: 0, cr: r2(grabGross) });
    if (A(rev.thai))     revLines.push({ code: "4040-LS", dr: 0, cr: r2(A(rev.thai)) });
    if (revLines.length) out.push({ no: no + "-A", title: "บันทึกรายได้ประจำวัน", lines: revLines });

    const TITLE = {
      cash: "ต้นทุนและค่าใช้จ่ายที่จ่ายเงินสด",
      transfer: "ต้นทุนและค่าใช้จ่ายที่จ่ายโอน",
      credit: "ซื้อเชื่อ (ยังไม่จ่าย)",
      ns: "รับของจากร้านก๋วยเตี๋ยว (ยังไม่จ่ายเงิน)",
    };
    PAY_KEYS.forEach((k, i) => {
      const sub = active.filter((l) => payOf(l) === k && A(l.amt) !== 0);
      const agg = {};
      sub.forEach((l) => { agg[CATS[l.cat].code] = r2((agg[CATS[l.cat].code] || 0) + A(l.amt)); });
      /* ค่าแรงรายวันจากการเช็คชื่อ — รวมเข้าใบจ่ายเงินสด */
      if (k === "cash" && wageToday) agg["6010-LS"] = r2((agg["6010-LS"] || 0) + wageToday);
      const drLines = Object.entries(agg).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([code, dr]) => ({ code, dr, cr: 0 }));
      if (!drLines.length) return;
      const total = r2(drLines.reduce((s, l) => s + l.dr, 0));
      out.push({
        no: no + "-" + "BCDE"[i], title: TITLE[k],
        lines: [...drLines, { code: PAY[k].code, dr: 0, cr: total }],
      });
    });

    /* เงินเบิกล่วงหน้า — ลงเป็นลูกหนี้พนักงาน ไม่ใช่ค่าใช้จ่าย */
    if (advTotal) {
      const lines = [{ code: "1032-LS", dr: advTotal, cr: 0 }];
      if (advCash) lines.push({ code: "1010-LS", dr: 0, cr: advCash });
      if (advBank) lines.push({ code: "1020-LS", dr: 0, cr: advBank });
      out.push({ no: no + "-F", title: "เงินเบิกล่วงหน้าพนักงาน (ยังไม่ใช่ค่าแรง)", lines });
    }
    return out;
  }, [active, day.rows, rev, grabPct, date, vendors, wageToday, advTotal, advCash, advBank]);

  const sumDr = r2(journals.reduce((s, j) => s + j.lines.reduce((a, l) => a + l.dr, 0), 0));
  const sumCr = r2(journals.reduce((s, j) => s + j.lines.reduce((a, l) => a + l.cr, 0), 0));
  const balanced = Math.abs(sumDr - sumCr) < 0.005 && sumDr > 0;

  const summary = useMemo(() => {
    const T = (a) => a.join("\t");
    const L = [];
    L.push(`ร้านอีสาน/ลาบ (LS) — ${thDate(date)}`);
    L.push("");
    L.push(T(["วันที่", "ประเภท", "หมวด", "รายการ", "ร้าน", "วิธีจ่าย", "จำนวน", "หน่วย", "ราคา/หน่วย", "ยอดรวม", "รหัสบัญชี"]));
    const d = thDate(date);
    const rv = [["cash", "เงินสด", "4010-LS"], ["transfer", "เงินโอน", "4020-LS"],
                ["grab", "เงินแกร๊ป", "4030-LS"], ["thai", "ไทยช่วยไทย", "4040-LS"]];
    rv.forEach(([k, lab, code]) => {
      if (!A(rev[k])) return;
      L.push(T([d, "รับเงิน", lab, "", "", "", "", "", "", String(r2(A(rev[k]))), code]));
    });
    if (grabComm) L.push(T([d, "รายจ่าย", "ค่าคอม Grab", `หัก ${grabPct}%`, "Grab", "หักจากยอด", "", "", "", String(grabComm), "6330-LS"]));
    active.forEach((l) => {
      L.push(T([d, "ซื้อของ", CATS[l.cat].label, l.name, l.vendor, PAY[payOf(l)].label,
                has(l.qty) ? String(r2(A(l.qty))) : "", l.unit,
                has(l.rate) ? String(r2(A(l.rate))) : "", String(r2(A(l.amt))), CATS[l.cat].code]));
    });
    employees.forEach((e) => {
      if (att[e.id] === undefined) return;
      L.push(T([d, "ค่าแรง", "ค่าแรงคนงาน", e.name, "", "จ่ายสด", "1", "วัน",
                String(r2(A(att[e.id]))), String(r2(A(att[e.id]))), "6010-LS"]));
    });
    advToday.forEach((a) => {
      const e = empById[a.employee_id];
      L.push(T([d, "เบิกล่วงหน้า", "ลูกหนี้พนักงาน", (e && e.name) || "", "",
                a.payment_method === "cash" ? "จ่ายสด" : "โอน", "", "", "", String(r2(A(a.amount))), "1032-LS"]));
    });
    L.push("");
    L.push(`รวมรับ\t${r2(totalIn)}`);
    L.push(`รวมจ่าย\t${r2(totalOut)}`);
    L.push(`ค่าคอม Grab\t${grabComm}`);
    L.push(`รับจากร้านก๋วยเตี๋ยว\t${nsTotal}`);
    L.push(`Prime Cost\t${prime}\t${pct(prime, totalIn)}`);
    L.push(`กำไรวันนี้ (ก่อนค่าคงที่)\t${profit}`);
    L.push("");
    L.push(`เงินสดยกมา\t${r2(A(cashOpen))}`);
    L.push(`ขายเงินสด\t${r2(A(rev.cash))}`);
    L.push(`จ่ายเงินสด\t${cashPaid}`);
    L.push(`ควรมีในลิ้นชัก\t${cashShould}`);
    if (cashDiff !== null) {
      L.push(`นับได้จริง\t${r2(A(cashCount))}`);
      L.push(`ต่าง\t${cashDiff}\t${cashDiff === 0 ? "ตรงกัน" : cashDiff < 0 ? "เงินขาด" : "เงินเกิน"}`);
    }
    L.push("");
    L.push("สมุดรายวัน");
    journals.forEach((j) => {
      L.push(`${j.no}\t${j.title}`);
      j.lines.forEach((l) => L.push(T(["", l.code, accName(l.code), l.dr ? String(l.dr) : "", l.cr ? String(l.cr) : ""])));
    });
    L.push(T(["", "", "รวมทั้งสิ้น", String(sumDr), String(sumCr)]));
    return L.join("\n");
  }, [date, rev, grabPct, active, day.rows, journals, cashOpen, cashCount, vendors, att, employees, advToday, empById]);

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
    } catch (e) {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.select(); try { document.execCommand("copy"); setCopied(true); } catch (e2) { /* ผู้ใช้คัดลอกเอง */ } }
    }
    setTimeout(() => setCopied(false), 2500);
  };

  const closeDay = async () => {
    setClosed(true);
    track(saveJournalsDB(date, journals));
  };

  const shiftDay = (n) => {
    const t = new Date(date + "T00:00:00");
    t.setDate(t.getDate() + n);
    setDate(t.toISOString().slice(0, 10));
  };

  const openDaysPanel = async () => {
    setShowDays(true);
    if (!daysSummary) {
      try { setDaysSummary(await fetchSavedDatesSummary()); }
      catch (e) { setSaveError(String((e && e.message) || e)); }
    }
  };

  const deleteDay = async (d) => {
    if (!window.confirm(`ลบข้อมูลวันที่ ${thDate(d)} ทั้งหมด? กดยืนยันแล้วจะมีปุ่ม "เลิกทำ" ให้กดคืนได้ในไม่กี่วินาทีถัดไป`)) return;
    try {
      const snapshot = await fetchDayRaw(d);
      await deleteDayDB(d);
      setDaysSummary((p) => p && p.filter((x) => x.d !== d));
      if (d === date) loadDay(date, catalog);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoState({ date: d, snapshot });
      undoTimerRef.current = setTimeout(() => setUndoState(null), 20000);
    } catch (e) {
      setSaveError("ลบข้อมูลวันที่ " + d + " ไม่สำเร็จ: " + String((e && e.message) || e));
    }
  };

  const undoDelete = async () => {
    if (!undoState) return;
    const { date: d, snapshot } = undoState;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoState(null);
    try {
      await restoreDayDB(snapshot);
      setDaysSummary(null);
      if (d === date) loadDay(date, catalog);
    } catch (e) {
      setSaveError("กู้คืนข้อมูลวันที่ " + d + " ไม่สำเร็จ: " + String((e && e.message) || e));
    }
  };

  /* ── สำรอง / กู้ข้อมูล — ยังคงไว้เป็นทางสำรอง (ดาวน์โหลด/นำเข้าไฟล์ .json) ── */
  const backup = () => {
    const blob = new Blob([JSON.stringify({ catalog, vendors, grabPct, date, day }, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laab-LS-สำรองข้อมูล-${date}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  /* กู้จากไฟล์สำรองรุ่นเก่า (localStorage) — นำเข้าเข้า Supabase ให้อัตโนมัติ */
  const restore = (file) => {
    const fr = new FileReader();
    fr.onload = async () => {
      try {
        const d = JSON.parse(String(fr.result));
        if (!d || !d.days) throw new Error("รูปแบบไฟล์ไม่ถูก (ต้องเป็นไฟล์สำรองจาก v15 เดิม)");
        setResetNote("กำลังนำเข้าข้อมูล…");
        const nameToId = {};
        for (const it of (d.catalog || [])) {
          const match = catalog.find((c) => c.name === it.name);
          if (match) { nameToId[it.name] = match.id; continue; }
          const id = await upsertItemDB({ cat: it.cat, name: it.name, unit: it.unit, vendor: it.vendor, off: !!it.off });
          nameToId[it.name] = id;
        }
        for (const [name, pay] of Object.entries(d.vendors || {})) await upsertVendorDB(name, pay);
        if (d.grabPct != null) await setGrabPctDB(d.grabPct);
        for (const [dt, dayObj] of Object.entries(d.days || {})) {
          for (const [oldId, r] of Object.entries(dayObj.rows || {})) {
            const oldItem = (d.catalog || []).find((c) => String(c.id) === String(oldId));
            const newId = oldItem ? nameToId[oldItem.name] : null;
            if (newId) await saveRowDB(dt, newId, r);
          }
          for (const [ch, amt] of Object.entries(dayObj.rev || {})) if (has(amt)) await saveRevDB(dt, ch, amt, d.grabPct || grabPct);
          await saveCashDB(dt, { opening_cash: has(dayObj.cashOpen) ? A(dayObj.cashOpen) : null, counted_cash: has(dayObj.cashCount) ? A(dayObj.cashCount) : null, is_closed: !!dayObj.closed });
        }
        const [c] = await Promise.all([fetchCatalog()]);
        setCatalogState(c);
        setVendorsState(await fetchVendors());
        setGrabPctState(await fetchGrabPct());
        loadDay(date, c);
        setResetNote(`นำเข้าสำเร็จ — ${Object.keys(d.days).length} วัน`);
      } catch (e) {
        setResetNote("นำเข้าไม่สำเร็จ: " + String((e && e.message) || e));
      }
    };
    fr.readAsText(file);
  };

  const cmp = compare ? HIST[compare] : null;
  const cmpBest = cmp ? Math.min(...cmp.map((c) => c[1])) : 0;

  /* ═══════════ แถวรายการ ═══════════ */
  const renderEdit = (it) => (
    <div className={`erow${it.off ? " off" : ""}`} key={it.id}>
      <input className="e-name" value={it.name} aria-label={`แก้ชื่อ ${it.name}`}
        onChange={(e) => patchItem(it.id, { name: e.target.value })} />
      <input className="e-unit" value={it.unit} aria-label={`แก้หน่วย ${it.name}`}
        onChange={(e) => patchItem(it.id, { unit: e.target.value })} />
      <input className="e-vend" list="vlist" value={it.vendor} aria-label={`แก้ร้านประจำ ${it.name}`}
        onChange={(e) => { const v = e.target.value.trim() || "—"; patchItem(it.id, { vendor: v }); }} />
      <button className="e-off" onClick={() => patchItem(it.id, { off: !it.off })}>
        {it.off ? "เอากลับมา" : "เอาออก"}
      </button>
    </div>
  );

  const renderRow = (it) => {
    const r = R(it.id);
    const f = priceFlag(it);
    const on = A(r.qty) !== 0 || A(r.amt) !== 0;
    const waiting = A(r.qty) !== 0 && !has(r.amt);
    const conf = isConflict(r);
    const pk = payOf(r);
    return (
      <React.Fragment key={it.id}>
        <div ref={(el) => { rowRef.current[it.id] = el; }}
          className={`irow${on ? " on" : ""}${waiting ? " wait" : ""}${hi === it.id ? " hi" : ""}`}>
          <span className="iname">
            {it.name}
            {HIST[it.name] && (
              <button className="cmpbtn" onClick={() => setCompare(compare === it.name ? null : it.name)}>เทียบ</button>
            )}
            {!on && prevOf[it.id] && A(prevOf[it.id].qty) > 0 && (
            <span className="yhint">{prevOf[it.id].when ? thDate(prevOf[it.id].when) : "ครั้งก่อน"} {dec(prevOf[it.id].qty)}</span>
          )}
          </span>

          <input className={`f-vend${pk === "ns" ? " ns" : ""}`} list="vlist" value={r.vendor}
            aria-label={`ร้านที่ซื้อ ${it.name}`}
            onChange={(e) => setVend(it.id, e.target.value)} />

          <select className={`f-pay p-${pk}`} value={pk} aria-label={`วิธีจ่าย ${it.name}`}
            onChange={(e) => setPay(it.id, e.target.value)}>
            {PAY_KEYS.map((k) => <option key={k} value={k}>{PAY[k].label}</option>)}
          </select>

          <input className={`f-qty${r.tq ? " typed" : ""}`} inputMode="decimal" placeholder="—"
            aria-label={`จำนวน ${it.name}`} value={show(it.id, "qty")} {...fProps(it.id, "qty")}
            onChange={(e) => edit(it.id, "qty", e.target.value)} />
          <span className="iunit">{it.unit}</span>
          <span className="op ox">×</span>

          <input className={`f-rate${r.tr ? " typed" : ""}${f ? (f.up ? " flagup" : " flagdown") : ""}`}
            inputMode="decimal" aria-label={`ราคาต่อหน่วย ${it.name}`}
            value={show(it.id, "rate")} {...fProps(it.id, "rate")}
            onChange={(e) => edit(it.id, "rate", e.target.value)} />
          <span className="op eq">=</span>

          <input className={`f-amt${r.ta ? " typed" : ""}`} inputMode="decimal" placeholder="—"
            aria-label={`ยอดรวม ${it.name}`} value={show(it.id, "amt")} {...fProps(it.id, "amt")}
            onChange={(e) => edit(it.id, "amt", e.target.value)} />

          {waiting && <span className="rowmsg wait">ยังไม่มียอดเงิน — ใส่ราคาหรือยอดรวม</span>}
          {f && !conf && (
            <span className={`rowmsg ${f.up ? "up" : "down"}`}>
              {f.up ? "↑ แพงขึ้น" : "↓ ถูกลง"} {f.txt}% · {f.when ? thDate(f.when) : "ครั้งก่อน"} {dec(f.y)}/{it.unit}
            </span>
          )}
        </div>

        {conf && (
          <div className="conf">
            <p>⚠ <b>{it.name}</b> — {dec(A(r.qty))} {it.unit} × {dec(A(r.rate))} = {money(A(r.qty) * A(r.rate))} แต่ใส่ยอดรวมไว้ {money(A(r.amt))}</p>
            <div className="confbtns">
              <button onClick={() => resolve(it.id, "amt")}>ยอดรวม {money(A(r.amt))} ถูก → ราคาเป็น {money(A(r.amt) / (A(r.qty) || 1))}/{it.unit}</button>
              <button onClick={() => resolve(it.id, "rate")}>ราคา {dec(A(r.rate))} ถูก → ยอดเป็น {money(A(r.qty) * A(r.rate))}</button>
            </div>
          </div>
        )}

        {compare === it.name && cmp && (
          <div className="cmpbox">
            <button className="cmpclose" onClick={() => setCompare(null)} aria-label="ปิด">×</button>
            <h4>{it.name} — ราคาต่อหน่วยแต่ละร้าน</h4>
            {[...cmp].sort((a, b) => a[1] - b[1]).map(([v, p]) => (
              <div className={`cmprow${p === cmpBest ? " best" : ""}`} key={v}>
                <span>{v}{p === cmpBest ? " ← ถูกที่สุด" : ""}</span>
                <span className="p">{dec(p)}</span>
              </div>
            ))}
          </div>
        )}
      </React.Fragment>
    );
  };

  if (bootError) {
    return <LoadingScreen text={"เชื่อมต่อฐานข้อมูลไม่สำเร็จ: " + bootError} />;
  }
  if (!bootReady) {
    return <LoadingScreen text="กำลังโหลดผังของและร้านค้า…" />;
  }

  /* ═══════════ หน้าจอ ═══════════ */
  return (
    <div className="wrap">
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
.wrap{--paper:#FBFAF6;--ink:#1E2A24;--soft:#6B7C72;--rule:#C9DCC8;--margin:#A8443A;
 --field:#F1F4EE;--dr:#2A5A78;--cr:#8A6A1F;--ns:#7A4E8C;--ok:#1E6E4A;--wait:#B4740E;
 font-family:'Sarabun',system-ui,sans-serif;color:var(--ink);background:var(--paper);padding:18px}
.wrap *{box-sizing:border-box}
.hdr{display:flex;flex-wrap:wrap;gap:12px;align-items:baseline;justify-content:space-between;
 border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:16px}
.hdr h1{font-size:19px;font-weight:700;margin:0}
.hdr .sub{font-size:12px;color:var(--soft);margin-left:10px;font-weight:400}
.dright{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.dtext{font-size:12.5px;color:var(--soft);font-weight:600}
.navb{font-family:'Sarabun',sans-serif;font-size:14px;line-height:1;padding:6px 9px;border:1px solid var(--rule);
 background:#fff;color:var(--ink);border-radius:3px;cursor:pointer}
.navb:hover{background:var(--field)}
.navb.wide{font-size:11.5px;font-weight:600}
.userchip{font-size:11px;color:var(--soft)}
.dayrow{display:flex;align-items:center;gap:10px;padding:6px 2px;border-bottom:1px solid #EEF2EC;font-size:12.5px}
.dayrow.cur{background:var(--field);font-weight:600}
.dayjump{flex:1;text-align:left;border:none;background:transparent;font-family:'Sarabun',sans-serif;
 font-size:12.5px;color:var(--dr);cursor:pointer;text-decoration:underline;padding:2px}
.dayv{font-family:'IBM Plex Mono',monospace;font-size:11.5px;color:var(--soft);white-space:nowrap}
.daydel{border:none;background:transparent;color:var(--margin);font-size:11px;cursor:pointer;font-family:'Sarabun',sans-serif}
.savebox .ok2{font-size:11.5px;color:var(--ok);margin:0 0 8px;font-weight:600}
.dateinput{font-family:'IBM Plex Mono',monospace;font-size:13px;border:1px solid var(--rule);
 background:#fff;border-radius:3px;padding:6px 9px;color:var(--ink)}
.cols{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:24px}
@media(max-width:1000px){.cols{grid-template-columns:1fr;gap:18px}}
.card{background:#fff;border:1px solid var(--rule);border-radius:4px;padding:14px 15px;margin-bottom:16px}
.eyebrow{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--soft);
 font-weight:600;margin:0 0 10px;display:flex;justify-content:space-between;align-items:baseline;gap:10px}
.eyebrow .plain{letter-spacing:0;text-transform:none;font-size:11.5px;font-weight:400}

.askbar{border:1px solid var(--margin);background:#FBEEEC;border-radius:4px;padding:11px 13px;margin-bottom:14px}
.askbar p{margin:0 0 8px;font-size:12.5px;color:var(--margin);font-weight:600}
.askbar .btns{display:flex;gap:7px;flex-wrap:wrap}
.askbar button{font-family:'Sarabun',sans-serif;font-size:12px;font-weight:600;padding:6px 11px;
 border-radius:3px;cursor:pointer;border:1px solid var(--margin);background:#fff;color:var(--margin)}
.askbar button.go{background:var(--margin);color:#fff}

.revgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;align-items:start}
@media(max-width:560px){.revgrid{grid-template-columns:repeat(2,1fr)}}
.revcell label{display:block;font-size:11.5px;color:var(--soft);margin-bottom:3px}
.revcell input{width:100%;text-align:right;font-family:'IBM Plex Mono',monospace;
 font-variant-numeric:tabular-nums;font-size:14px;border:1px solid transparent;
 background:var(--field);border-radius:3px;padding:8px;color:var(--ink)}
.revcell input:focus{outline:none;border-color:var(--dr);background:#fff}
.grabline{margin-top:5px;font-size:10.5px;color:var(--soft);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.grabline input{width:38px;padding:3px 4px;text-align:center;font-size:11px;background:#fff;border:1px solid var(--rule)}
.grabout{font-family:'IBM Plex Mono',monospace;color:var(--ns);font-weight:600}
.grand{display:flex;justify-content:space-between;align-items:baseline;padding-top:10px;margin-top:6px;
 border-top:2px solid var(--ink);font-size:13px;font-weight:700}
.grand .v{font-family:'IBM Plex Mono',monospace;font-size:17px}

.cashgrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
@media(max-width:480px){.cashgrid{grid-template-columns:1fr}}
.cashline{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;
 padding:5px 0;border-bottom:1px solid #EEF2EC}
.cashline .v{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.cashsum{display:flex;justify-content:space-between;align-items:baseline;margin-top:8px;padding-top:8px;
 border-top:2px solid var(--ink);font-size:13.5px;font-weight:700}
.cashsum .v{font-family:'IBM Plex Mono',monospace;font-size:16px}
.cashres{margin-top:9px;padding:8px 11px;border-radius:3px;font-size:13px;font-weight:600;text-align:center}
.cashres.ok{background:#EDF6F0;color:var(--ok);border:1px solid var(--ok)}
.cashres.bad{background:#FBEEEC;color:var(--margin);border:1px solid var(--margin)}

.toolbar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
.tbtn{font-family:'Sarabun',sans-serif;font-size:12.5px;font-weight:600;padding:7px 12px;
 border:1px solid var(--ink);background:#fff;color:var(--ink);border-radius:3px;cursor:pointer}
.tbtn:hover{background:var(--field)}
.tbtn.ghost{border-color:var(--rule);color:var(--soft);font-weight:400}
button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--dr);outline-offset:1px}
.search{flex:1 1 150px;min-width:0;font-family:'Sarabun',sans-serif;font-size:12.5px;
 border:1px solid var(--rule);background:#fff;border-radius:3px;padding:7px 10px;color:var(--ink)}
.search:focus{outline:none;border-color:var(--dr)}
.qbox{border:1px solid var(--dr);border-radius:3px;background:#F4F9FC;padding:6px;margin-bottom:12px}
.qres{display:flex;justify-content:space-between;gap:8px;width:100%;background:transparent;border:none;
 font-family:'Sarabun',sans-serif;font-size:12.5px;padding:5px 6px;cursor:pointer;color:var(--ink);
 text-align:left;border-radius:3px}
.qres:hover{background:#fff}
.qres em{font-style:normal;color:var(--soft);font-size:11.5px}

.boxhead{margin:16px 0 2px;padding-bottom:5px;border-bottom:2px solid var(--ink);
 display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.boxhead:first-of-type{margin-top:4px}
.boxhead b{font-size:13px}
.boxhead em{font-style:normal;font-size:11px;color:var(--soft)}
.cgroup{border-bottom:1px solid var(--rule)}
.chead{width:100%;display:flex;justify-content:space-between;align-items:baseline;gap:10px;
 background:transparent;border:none;padding:10px 2px;cursor:pointer;text-align:left;font-family:'Sarabun',sans-serif}
.chead:hover{background:var(--field)}
.ch-l{display:flex;align-items:baseline;gap:7px;min-width:0;flex-wrap:wrap}
.chev{font-size:9px;color:var(--soft);flex:0 0 auto}
.cname{font-size:14px;font-weight:700}
.ccode{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--soft)}
.cmeta{font-size:11.5px;color:var(--soft)}
.ctot{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:14px;font-weight:600;flex:0 0 auto}
.ctot.zero{color:var(--soft);font-weight:400}
.cbody{padding:0 0 10px 12px}

.irow{display:grid;
 grid-template-columns:minmax(0,1fr) 82px 56px 48px 26px 12px 54px 12px 76px;
 gap:5px;align-items:center;padding:4px 0;border-bottom:1px solid #F2F5F0;
 scroll-margin:80px;border-radius:3px}
.irow.on{background:#F7FAF6}
.irow.wait{background:#FFF8EC}
.irow.hi{box-shadow:0 0 0 2px var(--dr);background:#F4F9FC}
.iname{font-size:13.5px;display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;min-width:0}
.irow.on .iname{font-weight:600}
.yhint{font-size:10.5px;color:var(--soft);font-family:'IBM Plex Mono',monospace}
.cmpbtn{border:none;background:transparent;color:var(--dr);cursor:pointer;font-size:10.5px;
 padding:0;text-decoration:underline;font-family:'Sarabun',sans-serif}
.f-vend,.f-pay{font-family:'Sarabun',sans-serif;font-size:11px;border:1px solid transparent;
 background:transparent;color:var(--soft);border-radius:3px;padding:4px 3px;width:100%;min-width:0}
.f-vend:hover,.f-pay:hover{border-color:var(--rule);background:#fff}
.f-vend:focus,.f-pay:focus{outline:none;border-color:var(--dr);background:#fff}
.f-vend.ns{color:var(--ns);font-weight:600}
.f-pay{cursor:pointer}
.f-pay.p-ns{color:var(--ns);font-weight:600}
.f-pay.p-transfer{color:var(--dr)}
.f-pay.p-credit{color:var(--cr)}
.irow input.f-qty,.irow input.f-rate,.irow input.f-amt{width:100%;text-align:right;
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:13px;
 border:1px solid transparent;background:transparent;border-radius:3px;padding:6px 5px;color:var(--soft)}
.irow input.typed{background:var(--field);color:var(--ink);font-weight:600}
.irow.on input.f-amt{background:var(--field);color:var(--ink)}
.irow input:focus{outline:none;border-color:var(--dr);background:#fff}
.irow input::placeholder{color:#C3CCC5}
.f-rate.flagup{background:#FBEEEC!important;border-color:var(--margin);color:var(--margin)!important}
.f-rate.flagdown{background:#EDF6F0!important;border-color:var(--ok);color:var(--ok)!important}
.iunit{font-size:10.5px;color:var(--soft)}
.op{font-family:'IBM Plex Mono',monospace;font-size:11px;color:#B9C4BB;text-align:center}
.rowmsg{grid-column:1/-1;font-size:11px;padding:1px 0 3px 2px}
.rowmsg.up{color:var(--margin)}.rowmsg.down{color:var(--ok)}.rowmsg.wait{color:var(--wait);font-weight:600}

.conf{margin:2px 0 8px;padding:10px 12px;border:1px solid var(--margin);border-radius:3px;background:#FBEEEC}
.conf p{margin:0 0 8px;font-size:12.5px;color:var(--margin)}
.confbtns{display:flex;gap:7px;flex-wrap:wrap}
.confbtns button{font-family:'Sarabun',sans-serif;font-size:12px;font-weight:600;padding:7px 11px;
 border:1px solid var(--margin);background:#fff;color:var(--margin);border-radius:3px;cursor:pointer;flex:1 1 200px}
.confbtns button:hover{background:var(--margin);color:#fff}

.linkrow{display:flex;gap:14px;flex-wrap:wrap}
.ehead{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;
 padding:7px 0 9px;font-size:11.5px;color:var(--soft);border-bottom:1px solid var(--rule);margin-bottom:6px}
.erow{display:grid;grid-template-columns:minmax(0,1.5fr) 62px minmax(0,1fr) 74px;gap:6px;
 align-items:center;padding:4px 0;border-bottom:1px solid #F2F5F0}
.erow.off{opacity:.45}
.erow input{font-family:'Sarabun',sans-serif;font-size:12.5px;border:1px solid var(--rule);
 background:#fff;border-radius:3px;padding:6px 8px;color:var(--ink);min-width:0;width:100%}
.erow input:focus{outline:none;border-color:var(--dr)}
.e-off{font-family:'Sarabun',sans-serif;font-size:11px;padding:6px 4px;border:1px solid var(--rule);
 background:#fff;color:var(--margin);border-radius:3px;cursor:pointer;white-space:nowrap}
.e-off:hover{background:#FBEEEC}
.enote{font-size:11px;color:var(--soft);margin:8px 0 0;line-height:1.5}
@media(max-width:680px){.erow{grid-template-columns:minmax(0,1fr) 56px;grid-template-areas:"nm nm" "vd un" "of of";gap:4px}
 .e-name{grid-area:nm}.e-unit{grid-area:un}.e-vend{grid-area:vd}.e-off{grid-area:of;padding:7px}}
.addrow{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px;padding-top:9px;border-top:1px dashed var(--rule)}
.addrow input{font-family:'Sarabun',sans-serif;font-size:12px;border:1px solid var(--rule);
 background:#fff;border-radius:3px;padding:6px 8px;color:var(--ink);min-width:0}
.a-name{flex:1.4}.a-vend{flex:1}.a-unit{flex:0 0 58px}
.addbtn{font-family:'Sarabun',sans-serif;font-size:12px;font-weight:600;padding:6px 11px;
 border:1px solid var(--ink);background:var(--ink);color:var(--paper);border-radius:3px;cursor:pointer}
.newlink{border:none;background:transparent;color:var(--dr);font-size:11.5px;cursor:pointer;
 font-family:'Sarabun',sans-serif;text-decoration:underline;padding:7px 2px}

.alertbar{margin-bottom:11px;padding:8px 11px;border-radius:3px;font-size:12px;font-weight:600}
.alertbar.red{border:1px solid var(--margin);background:#FBEEEC;color:var(--margin)}
.alertbar.amber{border:1px solid var(--wait);background:#FFF8EC;color:var(--wait)}
.alertbar.info{border:1px solid var(--dr);background:#F4F9FC;color:var(--dr);font-weight:400}
.cmpbox{margin:2px 0 8px;padding:10px 12px;border:1px solid var(--dr);border-radius:3px;background:#F4F9FC}
.cmpbox h4{margin:0 0 7px;font-size:12.5px;font-weight:700}
.cmprow{display:flex;justify-content:space-between;font-size:12px;padding:3px 0}
.cmprow .p{font-family:'IBM Plex Mono',monospace}
.cmprow.best{color:var(--ok);font-weight:600}
.cmpclose{border:none;background:transparent;color:var(--soft);cursor:pointer;float:right;font-size:15px}

.metrics{border:2px solid var(--ink);border-radius:4px;overflow:hidden;margin-bottom:14px}
.metric{display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:8px 13px;
 border-bottom:1px solid var(--rule)}
.metric:last-child{border-bottom:none}
.metric .k{font-size:12.5px}
.metric .k em{font-style:normal;color:var(--soft);font-size:11px;margin-left:5px}
.metric .n{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:14px;
 font-weight:500;white-space:nowrap}
.metric .n span{color:var(--soft);font-size:11.5px;margin-left:6px}
.metric.prime{background:var(--field)}
.metric.prime .k,.metric.prime .n{font-weight:700}
.metric.big{background:var(--ink);color:var(--paper);padding:11px 13px}
.metric.big .k{font-weight:700;font-size:13px}
.metric.big .n{font-size:21px;font-weight:600}
.metric.big .k em{color:#9FB3A8}
.metric.sub{background:#F7FAF6}
.metric.sub .k,.metric.sub .n{color:var(--ns)}
.good{color:var(--ok)}.warn{color:var(--margin)}
.btn{width:100%;padding:11px;border:none;border-radius:4px;background:var(--ink);color:var(--paper);
 font-family:'Sarabun',sans-serif;font-size:14.5px;font-weight:600;cursor:pointer}
.btn:hover{opacity:.88}

.savebox{margin-top:12px;border:2px solid var(--ok);border-radius:4px;padding:12px;background:#F4FAF6}
.savebox h4{margin:0 0 4px;font-size:13px;font-weight:700;color:var(--ok)}
.savebox .warn2{font-size:11.5px;color:var(--margin);margin:0 0 8px;font-weight:600}
.savebox textarea{width:100%;height:120px;font-family:'IBM Plex Mono',monospace;font-size:10.5px;
 border:1px solid var(--rule);border-radius:3px;padding:7px;background:#fff;color:var(--ink);resize:vertical}
.savebox .row2{display:flex;gap:7px;margin-top:8px}
.savebox .row2 button{flex:1;font-family:'Sarabun',sans-serif;font-size:12.5px;font-weight:600;
 padding:8px;border-radius:3px;cursor:pointer;border:1px solid var(--ok);background:var(--ok);color:#fff}
.savebox .row2 button.ghost{background:#fff;color:var(--soft);border-color:var(--rule)}

.ledger{background:#fff;border:1px solid var(--rule);border-radius:4px;padding:16px 18px 16px 24px;
 position:relative;overflow:hidden;margin-top:16px}
.ledger::before{content:"";position:absolute;left:12px;top:0;bottom:0;width:1.5px;background:var(--margin);opacity:.5}
.lhead{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
.lhead h2{font-size:14.5px;font-weight:700;margin:0}
.lnote{font-size:11.5px;color:var(--soft)}
.je{margin-top:15px}
.jetitle{font-size:12px;font-weight:600;padding-bottom:5px;border-bottom:1px solid var(--rule);
 display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.jeno{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--soft)}
.jline,.colhead,.balbar{display:grid;grid-template-columns:66px minmax(0,1fr) 84px 84px;gap:7px}
@media(max-width:520px){.jline,.colhead,.balbar{grid-template-columns:58px minmax(0,1fr) 66px 66px;gap:4px}}
.jline{align-items:baseline;padding:4px 0;font-size:12.5px;border-bottom:1px solid #EEF2EC}
.jcode{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--soft)}
.jname{min-width:0;overflow-wrap:anywhere}
.jname.indent{padding-left:14px;color:var(--soft)}
.jamt{text-align:right;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums;font-size:12.5px}
.jamt.d{color:var(--dr)}.jamt.c{color:var(--cr)}
.colhead{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--soft);font-weight:600;padding:8px 0 3px}
.colhead .r{text-align:right}
.balbar{margin-top:16px;padding-top:11px;border-top:2px solid var(--ink);align-items:baseline;
 grid-template-columns:minmax(0,1fr) 84px 84px}
@media(max-width:520px){.balbar{grid-template-columns:minmax(0,1fr) 66px 66px}}
.balbar .lab{font-size:13px;font-weight:700}
.seal{margin-top:10px;display:inline-flex;gap:7px;border:1.5px solid var(--ok);color:var(--ok);
 border-radius:3px;padding:5px 11px;font-size:12.5px;font-weight:600}
.seal.bad{border-color:var(--margin);color:var(--margin)}
.foot{margin-top:14px;font-size:11.5px;color:var(--soft);line-height:1.65}

/* ── พนักงาน · ค่าแรง · เงินเบิกล่วงหน้า ── */
.attrow{display:grid;grid-template-columns:minmax(0,1fr) 92px 96px;gap:8px;align-items:center;
 padding:7px 0;border-bottom:1px solid #EEF2EC}
.attname{display:flex;align-items:center;gap:9px;font-size:13.5px;min-width:0;cursor:pointer}
.attname input{width:17px;height:17px;accent-color:var(--ink);flex:none}
.attname span{overflow-wrap:anywhere}
.attrate{font-size:11.5px;color:var(--soft);text-align:right;font-variant-numeric:tabular-nums}
.attamt{font-family:'IBM Plex Mono',monospace;font-size:13px;text-align:right;padding:6px 8px;
 border:1px solid var(--rule);border-radius:3px;background:var(--field);width:100%;box-sizing:border-box}
.attamt:disabled{background:transparent;border-color:transparent;color:var(--soft)}
.attrow.on .attamt{background:#fff;color:var(--ink)}

.staffbox{border:1px solid var(--rule);border-radius:4px;padding:11px;margin-bottom:13px;background:var(--field)}
.emprow{display:grid;grid-template-columns:minmax(0,1fr) 92px 78px 46px auto;gap:7px;align-items:center;
 padding:5px 0;border-bottom:1px solid #EEF2EC}
.emprow.off{opacity:.5}
.e-name,.e-rate{font-family:'Sarabun',sans-serif;font-size:13px;padding:6px 8px;border:1px solid var(--rule);
 border-radius:3px;background:#fff;min-width:0;box-sizing:border-box}
.e-rate{font-family:'IBM Plex Mono',monospace;text-align:right}
.e-type,.prsel{font-family:'Sarabun',sans-serif;font-size:12.5px;padding:6px 5px;border:1px solid var(--rule);
 border-radius:3px;background:#fff;min-width:0;box-sizing:border-box}
.e-unit{font-size:11px;color:var(--soft)}

.advhead{font-size:12.5px;font-weight:600;margin:4px 0 7px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.advhead em{font-style:normal;font-weight:400;font-size:11.5px;color:var(--soft)}
.advrow{display:grid;grid-template-columns:minmax(0,1fr) 64px 88px 42px;gap:8px;align-items:center;
 padding:6px 0;border-bottom:1px solid #EEF2EC;font-size:13px}
.advname{overflow-wrap:anywhere}
.advpay{font-size:11.5px;color:var(--soft)}
.advamt{text-align:right;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}

.owedbox{margin-top:12px;border:1px solid var(--rule);border-radius:4px;padding:10px 11px;background:var(--field)}
.owedbox b{font-size:12px;display:block;margin-bottom:6px}
.owedrow{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:3px 0}
.owedrow span:last-child{font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.owedrow .warn{color:var(--margin);font-weight:600}

.prrow{display:grid;grid-template-columns:minmax(0,1.3fr) 108px 92px 92px 92px 72px;gap:8px;align-items:center;
 padding:6px 0;border-bottom:1px solid #EEF2EC;font-size:13px}
.prrow.prhead{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);font-weight:600}
.prrow.dim{opacity:.62}
.prrow.prtot{border-bottom:none;border-top:2px solid var(--ink);font-weight:700;padding-top:9px;
 font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.prname{overflow-wrap:anywhere}
.prtype{font-size:11px;color:var(--soft)}
.prnet{text-align:right;font-family:'IBM Plex Mono',monospace;font-variant-numeric:tabular-nums}
.prin{font-family:'IBM Plex Mono',monospace;font-size:12.5px;text-align:right;padding:5px 7px;width:100%;
 border:1px solid var(--rule);border-radius:3px;background:#fff;box-sizing:border-box}
.prin:disabled{background:transparent;border-color:transparent;color:var(--soft)}
@media(max-width:640px){
  .prrow{grid-template-columns:minmax(0,1fr) 76px 76px 76px;row-gap:3px}
  .prrow>span:nth-child(2),.prrow.prhead>span:nth-child(6),.prrow>span:nth-child(6){display:none}
  .emprow{grid-template-columns:minmax(0,1fr) 84px 66px}
  .emprow .e-unit{display:none}
}

@media(max-width:680px){
 .wrap{padding:14px 12px}
 .card{padding:13px 12px}
 .cbody{padding:0 0 10px 2px}
 .irow{grid-template-columns:50px 26px 12px 52px 12px minmax(0,1fr);
  grid-template-areas:"nm nm nm nm nm nm" "vd vd vd pv pv pv" "qt un ox rt eq am";
  gap:3px 5px;padding:9px 0 8px}
 .iname{grid-area:nm;font-size:14px}
 .f-vend{grid-area:vd;font-size:11.5px}
 .f-pay{grid-area:pv;text-align:right;text-align-last:right;font-size:11.5px}
 .f-qty{grid-area:qt}
 .iunit{grid-area:un;text-align:left}
 .op.ox{grid-area:ox}
 .f-rate{grid-area:rt}
 .op.eq{grid-area:eq}
 .f-amt{grid-area:am}
 .irow input.f-qty,.irow input.f-rate,.irow input.f-amt{font-size:14px;padding:8px 6px}
 .rowmsg{grid-area:auto;grid-column:1/-1}
 .addrow{display:grid;grid-template-columns:1fr 1fr}
 .a-name,.a-vend{grid-column:1/-1}
 .addbtn{grid-column:1/-1;padding:9px}
}
      `}</style>

      <datalist id="vlist">{Object.keys(vendors).map((v) => <option key={v} value={v} />)}</datalist>

      <div className="hdr">
        <h1>ร้านอีสาน/ลาบ<span className="sub">บันทึกรายวัน · สาขา LS · v17</span></h1>
        <div className="dright">
          <span className="userchip">{userEmail}</span>
          <button className="navb" onClick={() => supabase.auth.signOut()}>ออกจากระบบ</button>
          <button className="navb" onClick={() => shiftDay(-1)} aria-label="วันก่อนหน้า">‹</button>
          <span className="dtext">{thDate(date)}</span>
          <button className="navb" onClick={() => shiftDay(1)} aria-label="วันถัดไป">›</button>
          <input className="dateinput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="navb wide" onClick={openDaysPanel}>วันที่บันทึกไว้</button>
        </div>
      </div>

      {saveError && (
        <div className="alertbar red" style={{ marginBottom: 14 }} onClick={() => setSaveError("")}>
          ⚠ บันทึกขึ้นฐานข้อมูลไม่สำเร็จ: {saveError} (กดข้อความนี้เพื่อปิด)
        </div>
      )}
      {remoteChanged && (
        <div className="alertbar info" style={{ marginBottom: 14, cursor: "pointer" }}
          onClick={() => loadDay(date, catalog)}>
          🔄 มีคนอื่นแก้ไขข้อมูลวันนี้ — กดเพื่อโหลดข้อมูลล่าสุด
        </div>
      )}
      {pendingSaves > 0 && (
        <div className="alertbar info" style={{ marginBottom: 14 }}>กำลังบันทึกขึ้นฐานข้อมูล…</div>
      )}
      {undoState && (
        <div className="alertbar info" style={{ marginBottom: 14, cursor: "pointer" }} onClick={undoDelete}>
          🗑 ลบข้อมูลวันที่ {thDate(undoState.date)} แล้ว — กดข้อความนี้เพื่อเลิกทำ (ใช้ได้ไม่กี่วินาที)
        </div>
      )}

      {showDays && (
        <div className="card">
          <p className="eyebrow">
            <span>วันที่บันทึกไว้ (ในฐานข้อมูลกลาง)</span>
            <span className="plain">
              <button className="tbtn ghost" onClick={backup}>ดาวน์โหลดสำรองข้อมูล</button>{" "}
              <button className="tbtn ghost" onClick={() => fileRef.current && fileRef.current.click()}>นำเข้าจากไฟล์สำรองเก่า</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) restore(f); e.target.value = ""; }} />
            </span>
          </p>
          {!daysSummary ? (
            <p style={{ fontSize: 12.5, color: "var(--soft)", margin: 0 }}>กำลังโหลด…</p>
          ) : daysSummary.length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--soft)", margin: 0 }}>ยังไม่มีวันไหนบันทึกไว้</p>
          ) : daysSummary.map((x) => (
            <div className={`dayrow${x.d === date ? " cur" : ""}`} key={x.d}>
              <button className="dayjump" onClick={() => { setDate(x.d); setShowDays(false); }}>
                {thDate(x.d)}{x.closed ? " ✓" : ""}
              </button>
              <span className="dayv">รับ {money(x.inn)}</span>
              <span className="dayv">จ่าย {money(x.outn)}</span>
              <button className="daydel" onClick={() => deleteDay(x.d)} aria-label={`ลบข้อมูล ${thDate(x.d)}`}>ลบ</button>
            </div>
          ))}
          <p className="foot" style={{ marginTop: 10 }}>
            ข้อมูลเก็บอยู่ในฐานข้อมูลกลาง (Supabase) — พนักงานทุกคนเห็นตรงกัน ต้องต่อเน็ตตอนใช้งาน
          </p>
        </div>
      )}

      {showPayroll && (
        <div className="card">
          <p className="eyebrow">
            <span>ปิดยอดค่าแรง — {thMonth(payPeriod)}</span>
            <span className="plain"><button className="tbtn ghost" onClick={() => setShowPayroll(false)}>ปิดหน้านี้</button></span>
          </p>
          {!payData ? (
            <p style={{ fontSize: 12.5, color: "var(--soft)", margin: 0 }}>กำลังโหลด…</p>
          ) : (
            <>
              <div className="prrow prhead">
                <span>พนักงาน</span><span>ประเภท</span><span>ค่าแรงเดือนนี้</span><span>หักเงินเบิก</span><span>จ่ายจริง</span><span>วิธีจ่าย</span>
              </div>
              {payData.rows.map((r) => {
                const e = empById[r.id] || {};
                const isM = e.pay_type === "monthly";
                return (
                  <div className={`prrow${isM ? "" : " dim"}`} key={r.id}>
                    <span className="prname">{e.name}</span>
                    <span className="prtype">{isM ? "รายเดือน" : "รายวัน · จ่ายไปแล้ว"}</span>
                    <span>
                      <input className="prin" inputMode="decimal" value={r.wage} disabled={!isM || r.closed}
                        onChange={(ev) => editPay(r.id, "wage", ev.target.value)} />
                    </span>
                    <span>
                      <input className="prin" inputMode="decimal" value={isM ? r.ded : ""} disabled={!isM || r.closed}
                        onChange={(ev) => editPay(r.id, "ded", ev.target.value)} />
                    </span>
                    <span className="prnet">{isM ? money(A(r.wage) - A(r.ded)) : "—"}</span>
                    <span>
                      <select className="prsel" value={r.method} disabled={!isM || r.closed}
                        onChange={(ev) => setPayData((d) => d && ({ ...d, rows: d.rows.map((x) => (x.id === r.id ? { ...x, method: ev.target.value } : x)) }))}>
                        <option value="cash">สด</option>
                        <option value="transfer">โอน</option>
                      </select>
                    </span>
                  </div>
                );
              })}
              {payTotals && (
                <div className="prrow prtot">
                  <span>รวม</span><span />
                  <span>{money(payTotals.wage)}</span>
                  <span>{money(payTotals.ded)}</span>
                  <span>{money(payTotals.net)}</span>
                  <span />
                </div>
              )}
              <p className="enote">
                คนรายวันจ่ายสดไปแล้วทุกวัน (ยอดที่โชว์คือรวมทั้งเดือน ไม่ลงบัญชีซ้ำ) — ใบสำคัญเดือนนี้ลงเฉพาะค่าแรงคนรายเดือน
                <br />ยอด "หักเงินเบิก" ตั้งให้เท่ายอดค้างอัตโนมัติ แก้ลงได้ · ระบบตัดเงินเบิกใบเก่าก่อน เฉพาะใบที่ยอดหักครอบคลุมเต็มใบ
                <br />หักเงินเบิกได้เฉพาะคนรายเดือน — คนรายวันรับเงินครบทุกวันแล้ว ไม่มีค่าแรงค้างให้หัก ถ้าคนรายวันค้างเบิกต้องเก็บเงินคืนเอง แล้วค่อยลบรายการเบิกวันนั้นออก
              </p>
              {payJournal && (
                <div className="je">
                  <div className="jetitle">
                    <span className="jeno">{payJournal.no}</span>
                    <span>{payJournal.title} · ลงวันที่ {thDate(monthEnd(payPeriod))}</span>
                  </div>
                  {payJournal.lines.map((l, i) => (
                    <div className="jline" key={i}>
                      <span className="jcode">{l.code}</span>
                      <span className={`jname${l.cr ? " indent" : ""}`}>{accName(l.code)}</span>
                      <span className="jamt d">{l.dr ? money(l.dr) : ""}</span>
                      <span className="jamt c">{l.cr ? money(l.cr) : ""}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                {payData.rows.every((r) => r.closed) ? (
                  <span className="seal">✓ ปิดยอดเดือนนี้แล้ว</span>
                ) : (
                  <button className="btn" onClick={closePayroll} disabled={!payJournal}>
                    ปิดยอดค่าแรง {thMonth(payPeriod)}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {dayLoading ? (
        <div className="card"><p style={{ fontSize: 13, color: "var(--soft)", margin: 0 }}>กำลังโหลดข้อมูลวันที่ {thDate(date)}…</p></div>
      ) : (
      <div className="cols">
        {/* ══ ซ้าย ══ */}
        <div>
          <div className="card">
            <p className="eyebrow"><span>รับเงินวันนี้</span></p>
            <div className="revgrid">
              {[["cash", "เงินสด"], ["transfer", "เงินโอน"], ["grab", "เงินแกร๊ป"], ["thai", "ไทยช่วยไทย"]].map(([k, l]) => (
                <div className="revcell" key={k}>
                  <label htmlFor={`r-${k}`}>{l}</label>
                  <input id={`r-${k}`} inputMode="decimal" placeholder="0"
                    value={focusKey === "rev:" + k ? rev[k] : (rev[k] === "" ? "" : dec(A(rev[k])))}
                    onFocus={() => setFocusKey("rev:" + k)}
                    onBlur={() => setFocusKey((x) => (x === "rev:" + k ? null : x))}
                    onChange={(e) => { const v = numStr(e.target.value); setRev((p) => ({ ...p, [k]: v })); dirty(); track(saveRevDB(date, k, v, grabPct)); }} />
                  {k === "grab" && (
                    <div className="grabline">
                      <span>หัก</span>
                      <input inputMode="decimal" value={grabPct} aria-label="เปอร์เซ็นต์ค่าคอม Grab"
                        onChange={(e) => { setGrabPct(numStr(e.target.value)); dirty(); }} />
                      <span>%</span>
                      {grabGross > 0 && <span className="grabout">เข้าจริง {money(grabNet)} · คอม {money(grabComm)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="grand"><span>รวมรับ</span><span className="v">{money(totalIn)}</span></div>
          </div>

          <div className="card">
            <p className="eyebrow">
              <span>ซื้อของและรายจ่ายวันนี้</span>
              <span className="plain">{active.length} รายการ</span>
            </p>

            {conflicts.length > 0 && (
              <div className="alertbar red">⚠ ตัวเลขขัดกัน {conflicts.length} รายการ — เลือกว่าเลขไหนถูกก่อน</div>
            )}
            {pending.length > 0 && (
              <div className="alertbar amber">
                ⚠ ใส่จำนวนแล้วแต่ยังไม่มียอดเงิน {pending.length} รายการ — {pending.map((p) => p.name).join(", ")}
              </div>
            )}
            {flagged > 0 && (
              <div className="alertbar red">⚠ ราคาต่างจากครั้งก่อนเกิน 10% — {flagged} รายการ</div>
            )}

            <div className="toolbar">
              <button className="tbtn" onClick={resetRates}>คืนราคาครั้งก่อน</button>
              <button className="tbtn ghost" onClick={clearQty}>ล้างจำนวน</button>
              <input className="search" placeholder="หาของ… พิมพ์ 2-3 ตัวอักษร"
                value={q} onChange={(e) => setQ(e.target.value)} />
            </div>

            {resetNote && <div className="alertbar info">{resetNote}</div>}

            {found.length > 0 && (
              <div className="qbox">
                {found.map((it) => (
                  <button className="qres" key={it.id} onClick={() => goTo(it)}>
                    <span>{it.name}</span>
                    <em>{CATS[it.cat].label} · {R(it.id).vendor}</em>
                  </button>
                ))}
              </div>
            )}

            {BOXES.map((b) => (
              <div key={b.key}>
                <div className="boxhead"><b>{b.title}</b><em>{b.hint}</em></div>
                {catsIn(b.key).map((c) => {
                  const cnt = catCount(c), tot = catTotal(c);
                  return (
                    <div className="cgroup" key={c}>
                      <button className="chead" onClick={() => toggle(c)} aria-expanded={isOpen(c)}>
                        <span className="ch-l">
                          <span className="chev" aria-hidden="true">{isOpen(c) ? "▾" : "▸"}</span>
                          <span className="cname">{CATS[c].label}</span>
                          <span className="ccode">{CATS[c].code}</span>
                          <span className="cmeta">{cnt > 0 ? `${cnt} รายการ` : `${inCat(c).length} รายการในหมวด`}</span>
                        </span>
                        <span className={`ctot${tot ? "" : " zero"}`}>{tot ? money(tot) : "—"}</span>
                      </button>
                      {isOpen(c) && c === "wage" ? (
                        <div className="cbody">
                          {dailyEmps.length === 0 ? (
                            <p className="enote" style={{ marginTop: 0 }}>
                              ยังไม่มีพนักงานรายวันในทะเบียน — กด <b>ทะเบียนพนักงาน</b> ในการ์ด "พนักงาน" ด้านล่างเพื่อเพิ่มชื่อ
                            </p>
                          ) : dailyEmps.map((e) => {
                            const on = att[e.id] !== undefined;
                            return (
                              <div className={`attrow${on ? " on" : ""}`} key={e.id}>
                                <label className="attname">
                                  <input type="checkbox" checked={on} onChange={() => toggleAtt(e)} disabled={closed} />
                                  <span>{e.name}</span>
                                </label>
                                <span className="attrate">{money(A(e.rate))}/วัน</span>
                                <input className="attamt" inputMode="decimal" placeholder="—" disabled={!on || closed}
                                  value={focusKey === "att:" + e.id ? (att[e.id] || "") : (on ? dec(A(att[e.id])) : "")}
                                  onFocus={() => setFocusKey("att:" + e.id)} onBlur={() => setFocusKey(null)}
                                  onChange={(ev) => editAtt(e.id, ev.target.value)} />
                              </div>
                            );
                          })}
                          {monthlyEmps.length > 0 && (
                            <p className="enote">
                              คนรายเดือน {monthlyEmps.length} คน ไม่ต้องเช็คชื่อ — ค่าแรงลงตอน <b>ปิดยอดค่าแรงเดือนนี้</b>
                            </p>
                          )}
                        </div>
                      ) : isOpen(c) && (
                        <div className="cbody">
                          {editCat === c ? (
                            <>
                              <div className="ehead">
                                <span>แก้ชื่อของ · หน่วย · ร้านประจำ ได้เลย พิมพ์ทับได้ทันที</span>
                                <button className="tbtn ghost" onClick={() => setEditCat(null)}>เสร็จแล้ว</button>
                              </div>
                              {inCat(c).map(renderEdit)}
                              <p className="enote">
                                "เอาออก" = ซ่อนจากหน้ากรอก <b>ไม่ลบข้อมูลเก่า</b> — ยอดของวันที่บันทึกไปแล้วยังอยู่ครบ
                              </p>
                            </>
                          ) : inCat(c).map(renderRow)}
                          {newFor === c ? (
                            <div className="addrow">
                              <input className="a-name" placeholder="ชื่อของใหม่" value={nn}
                                onChange={(e) => setNn(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && addItem()} />
                              <input className="a-vend" placeholder="ซื้อจากร้าน" list="vlist" value={nv}
                                onChange={(e) => setNv(e.target.value)} />
                              <input className="a-unit" placeholder="กก." value={nu} onChange={(e) => setNu(e.target.value)} />
                              <button className="addbtn" onClick={addItem}>เพิ่ม</button>
                              <button className="tbtn ghost" onClick={() => { setNewFor(null); setNn(""); setNu(""); setNv(""); }}>
                                ปิด
                              </button>
                            </div>
                          ) : (
                            <span className="linkrow">
                              <button className="newlink" onClick={() => setNewFor(c)}>+ เพิ่มของใหม่ในหมวดนี้</button>
                              <button className="newlink" onClick={() => setEditCat(editCat === c ? null : c)}>
                                {editCat === c ? "เลิกแก้รายการ" : "แก้รายการของในหมวดนี้"}
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="grand"><span>รวมจ่าย</span><span className="v">{money(totalOut)}</span></div>
          </div>

          <div className="card">
            <p className="eyebrow">
              <span>พนักงาน</span>
              <span className="plain">
                <button className="tbtn ghost" onClick={() => setShowStaff((s) => !s)}>
                  {showStaff ? "ปิดทะเบียน" : "ทะเบียนพนักงาน"}
                </button>{" "}
                <button className="tbtn ghost" onClick={() => openPayroll(monthOf(date))}>ปิดยอดค่าแรงเดือนนี้</button>
              </span>
            </p>

            {showStaff && (
              <div className="staffbox">
                {employees.length === 0 && <p className="enote" style={{ marginTop: 0 }}>ยังไม่มีพนักงานในทะเบียน เพิ่มชื่อด้านล่างได้เลย</p>}
                {employees.map((e) => (
                  <div className={`emprow${e.is_active ? "" : " off"}`} key={e.id}>
                    <input className="e-name" value={e.name} onChange={(ev) => patchEmployee(e.id, { name: ev.target.value })} />
                    <select className="e-type" value={e.pay_type} onChange={(ev) => patchEmployee(e.id, { pay_type: ev.target.value })}>
                      <option value="daily">รายวัน</option>
                      <option value="monthly">รายเดือน</option>
                    </select>
                    <input className="e-rate" inputMode="decimal" value={String(e.rate)}
                      onChange={(ev) => patchEmployee(e.id, { rate: numStr(ev.target.value) })} />
                    <span className="e-unit">{e.pay_type === "daily" ? "/วัน" : "/เดือน"}</span>
                    <button className="tbtn ghost" onClick={() => patchEmployee(e.id, { is_active: !e.is_active })}>
                      {e.is_active ? "เอาออก" : "เอากลับมา"}
                    </button>
                  </div>
                ))}
                <div className="addrow">
                  <input className="a-name" placeholder="ชื่อพนักงานใหม่" value={en}
                    onChange={(ev) => setEn(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && addEmployee()} />
                  <select className="e-type" value={ep} onChange={(ev) => setEp(ev.target.value)}>
                    <option value="daily">รายวัน</option>
                    <option value="monthly">รายเดือน</option>
                  </select>
                  <input className="a-unit" inputMode="decimal" placeholder="อัตรา" value={er}
                    onChange={(ev) => setEr(numStr(ev.target.value))} />
                  <button className="addbtn" onClick={addEmployee}>เพิ่ม</button>
                </div>
                <p className="enote">"เอาออก" = ซ่อนจากหน้ากรอก <b>ไม่ลบข้อมูลเก่า</b> — ค่าแรงที่บันทึกไปแล้วยังอยู่ครบ</p>
              </div>
            )}

            <div className="advhead">เงินเบิกล่วงหน้าวันนี้ <em>ยังไม่ใช่ค่าแรง — หักคืนตอนปิดยอดสิ้นเดือน</em></div>
            {advToday.map((a) => (
              <div className="advrow" key={a.id}>
                <span className="advname">{(empById[a.employee_id] || {}).name || "—"}</span>
                <span className="advpay">{a.payment_method === "cash" ? "จ่ายสด" : "โอน"}</span>
                <span className="advamt">{money(A(a.amount))}</span>
                <button className="daydel" onClick={() => delAdvance(a.id)} disabled={closed}>ลบ</button>
              </div>
            ))}
            {!closed && (
              <div className="addrow">
                <select className="a-name" value={advFor} onChange={(e) => setAdvFor(e.target.value)}>
                  <option value="">เลือกพนักงาน…</option>
                  {employees.filter((e) => e.is_active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <select className="e-type" value={advPay} onChange={(e) => setAdvPay(e.target.value)}>
                  <option value="cash">จ่ายสด</option>
                  <option value="transfer">โอน</option>
                </select>
                <input className="a-unit" inputMode="decimal" placeholder="จำนวน" value={advAmt}
                  onChange={(e) => setAdvAmt(numStr(e.target.value))} onKeyDown={(e) => e.key === "Enter" && addAdvance()} />
                <button className="addbtn" onClick={addAdvance}>เบิก</button>
              </div>
            )}

            {openAdv.length > 0 && (
              <div className="owedbox">
                <b>ยอดค้างเบิก (ยังไม่ได้หักคืน)</b>
                {employees.filter((e) => owedBy(e.id) > 0).map((e) => (
                  <div className="owedrow" key={e.id}>
                    <span>{e.name}</span>
                    <span className={owedBy(e.id) > A(e.rate) * (e.pay_type === "daily" ? 5 : 1) ? "warn" : ""}>
                      {money(owedBy(e.id))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <p className="eyebrow"><span>ปิดร้าน — นับเงิน</span></p>
            <div className="cashgrid">
              <div className="revcell">
                <label htmlFor="c-open">เงินสดยกมาต้นวัน{cashOpenAuto && <em style={{ fontStyle: "normal", color: "var(--ok)" }}> · ยกมาจาก {thDate(prevCash.when)}</em>}</label>
                <input id="c-open" inputMode="decimal" placeholder="0"
                  value={focusKey === "c:open" ? cashOpen : (cashOpen === "" ? "" : dec(A(cashOpen)))}
                  onFocus={() => setFocusKey("c:open")}
                  onBlur={() => setFocusKey((x) => (x === "c:open" ? null : x))}
                  onChange={(e) => { setCashOpen(numStr(e.target.value)); dirty(); }} />
              </div>
              <div className="revcell">
                <label htmlFor="c-count">นับเงินได้จริงตอนปิดร้าน</label>
                <input id="c-count" inputMode="decimal" placeholder="0"
                  value={focusKey === "c:count" ? cashCount : (cashCount === "" ? "" : dec(A(cashCount)))}
                  onFocus={() => setFocusKey("c:count")}
                  onBlur={() => setFocusKey((x) => (x === "c:count" ? null : x))}
                  onChange={(e) => { setCashCount(numStr(e.target.value)); dirty(); }} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="cashline"><span>เงินสดยกมา</span><span className="v">{money(A(cashOpen))}</span></div>
              <div className="cashline"><span>+ ขายเงินสดวันนี้</span><span className="v">{money(A(rev.cash))}</span></div>
              <div className="cashline"><span>− จ่ายเงินสดวันนี้</span><span className="v">{money(cashPaid)}</span></div>
              <div className="cashsum"><span>ควรมีในลิ้นชัก</span><span className="v">{money(cashShould)}</span></div>
            </div>
            {cashDiff !== null && (
              <div className={`cashres ${Math.abs(cashDiff) < 0.005 ? "ok" : "bad"}`}>
                {Math.abs(cashDiff) < 0.005
                  ? "✓ ตรงกัน"
                  : cashDiff < 0
                    ? `⚠ เงินขาด ${money(Math.abs(cashDiff))} บาท`
                    : `⚠ เงินเกิน ${money(cashDiff)} บาท`}
              </div>
            )}
          </div>
        </div>

        {/* ══ ขวา ══ */}
        <div>
          <div className="metrics">
            <div className="metric"><span className="k">ต้นทุนอาหาร<em>เนื้อ ผัก ของตลาด</em></span>
              <span className="n">{money(food)}<span>{pct(food, totalIn)}</span></span></div>
            <div className="metric"><span className="k">ต้นทุนเครื่องดื่ม/น้ำแข็ง</span>
              <span className="n">{money(bevT)}<span>{pct(bevT, totalIn)}</span></span></div>
            <div className="metric"><span className="k">ค่าแรง<em>รวมค่าข้าวพนักงาน</em></span>
              <span className="n">{money(labor)}<span>{pct(labor, totalIn)}</span></span></div>
            <div className="metric prime"><span className="k">Prime Cost<em>ควรต่ำกว่า 65%</em></span>
              <span className={`n ${totalIn > 0 && prime / totalIn <= 0.65 ? "good" : totalIn > 0 ? "warn" : ""}`}>
                {money(prime)}<span>{pct(prime, totalIn)}</span></span></div>
            <div className="metric"><span className="k">ค่าดำเนินงาน<em>บรรจุภัณฑ์ ของใช้ น้ำมัน แก๊ส</em></span>
              <span className="n">{money(ops)}<span>{pct(ops, totalIn)}</span></span></div>
            <div className="metric"><span className="k">ค่าคอม Grab<em>{grabPct}%</em></span>
              <span className="n">{money(grabComm)}<span>{pct(grabComm, totalIn)}</span></span></div>
            <div className="metric sub"><span className="k">รับจากร้านก๋วยเตี๋ยววันนี้<em>ยังไม่จ่าย</em></span>
              <span className="n">{money(nsTotal)}</span></div>
            <div className="metric big"><span className="k">กำไรวันนี้<em>ยังไม่หักค่าเช่า ไฟ น้ำ</em></span>
              <span className="n">{profit < 0 ? "−" : ""}{money(Math.abs(profit))}</span></div>
            <div className="metric big" style={{ borderTop: "1px solid #3C4A43" }}>
              <span className="k">เงินสดควรมีในลิ้นชัก</span>
              <span className="n">{cashShould < 0 ? "−" : ""}{money(Math.abs(cashShould))}</span></div>
          </div>

          <button className="btn" onClick={closeDay}>ปิดยอดวันนี้</button>

          {closed && (
            <div className="savebox">
              <h4>✓ ปิดยอด {thDate(date)} แล้ว — {active.length} รายการ · {journals.length} ใบสำคัญ</h4>
              <p className="ok2">✓ บันทึกขึ้นฐานข้อมูลกลางแล้ว — คัดลอกด้านล่างไว้ส่งนักบัญชี หรือเก็บใน Excel ก็ได้</p>
              <textarea ref={taRef} readOnly value={summary} onFocus={(e) => e.target.select()} />
              <div className="row2">
                <button onClick={doCopy}>{copied ? "✓ คัดลอกแล้ว" : "คัดลอกข้อมูล"}</button>
                <button className="ghost" onClick={() => setClosed(false)}>ปิด</button>
              </div>
            </div>
          )}

          <div className="ledger">
            <div className="lhead">
              <h2>สมุดรายวันทั่วไป</h2>
              <span className="lnote">{active.length} รายการ → {journals.reduce((s, j) => s + j.lines.length, 0)} บรรทัดบัญชี</span>
            </div>
            {journals.length === 0 ? (
              <p style={{ padding: "26px 4px", textAlign: "center", color: "var(--soft)", fontSize: 13 }}>
                ใส่ยอดรับและจำนวนที่ซื้อ แล้วรายการบัญชีจะขึ้นตรงนี้
              </p>
            ) : (
              <>
                <div className="colhead"><span>รหัส</span><span>ชื่อบัญชี</span>
                  <span className="r">เดบิต</span><span className="r">เครดิต</span></div>
                {journals.map((j) => (
                  <div className="je" key={j.no}>
                    <div className="jetitle"><span className="jeno">{j.no}</span><span>{j.title}</span></div>
                    {j.lines.map((l, i) => (
                      <div className="jline" key={i}>
                        <span className="jcode">{l.code}</span>
                        <span className={`jname${l.cr ? " indent" : ""}`}>{accName(l.code)}</span>
                        <span className="jamt d">{l.dr ? money(l.dr) : ""}</span>
                        <span className="jamt c">{l.cr ? money(l.cr) : ""}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="balbar"><span className="lab">รวมทั้งสิ้น</span>
                  <span className="jamt d" style={{ fontWeight: 600 }}>{money(sumDr)}</span>
                  <span className="jamt c" style={{ fontWeight: 600 }}>{money(sumCr)}</span></div>
                <div className={`seal${balanced ? "" : " bad"}`}>
                  {balanced ? "✓ เดบิต = เครดิต สมดุล" : `✗ ไม่สมดุล ต่าง ${money(Math.abs(sumDr - sumCr))}`}</div>
              </>
            )}
            <p className="foot">
              <b>ช่องสีเข้ม</b> = ตัวเลขที่พิมพ์เอง ระบบไม่แตะ · <b>ช่องสีจาง</b> = ระบบคำนวณให้<br />
              ใส่ยอดรวมก่อนได้ พอใส่จำนวนทีหลัง ระบบจะหาราคาต่อหน่วยให้เอง ไม่ทับยอดที่พิมพ์<br />
              ของจากร้านก๋วยเตี๋ยวลงตามหมวดจริง (เนื้อ→5010 ถุง→6210) เข้าเจ้าหนี้ 2100-LS เคลียร์สิ้นเดือน<br />
              ราคา "ครั้งก่อน" ดึงจากวันที่บันทึกไว้จริง ยิ่งใช้ยิ่งแม่น
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
