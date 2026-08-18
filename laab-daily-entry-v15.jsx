import React, { useState, useMemo, useRef, useEffect } from "react";

/* ═══════════════════════════════════════════════════════════
   หน้าจอบันทึกรายวัน ร้านลาบ (LS) — v14
   ตรงตามผังบัญชี laab_coa.xlsx และกฎแปลงรายการ 38 กฎ

   หลักการใหญ่: อะไรที่บอสหนึ่งพิมพ์เอง ระบบห้ามแตะ
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

/* ── 13 หมวด จัดเป็น 3 กลุ่ม ── */
const CATS = {
  meat:   { label: "ค่าเนื้อ",           code: "5010-LS", name: "ต้นทุนเนื้อสัตว์",            grp: "food",  box: "fresh" },
  veg:    { label: "ค่าผัก",             code: "5020-LS", name: "ต้นทุนผัก",                   grp: "food",  box: "fresh" },
  market: { label: "ของตลาด/ข้าว",       code: "5030-LS", name: "ต้นทุนของตลาด",               grp: "food",  box: "fresh" },
  bev:    { label: "เครื่องดื่ม/น้ำแข็ง", code: "5040-LS", name: "ต้นทุนน้ำ/น้ำแข็ง",          grp: "bev",   box: "fresh" },

  bag:    { label: "ถุง/กล่อง",          code: "6210-LS", name: "ค่าถุงพลาสติก/กล่องใส่อาหาร", grp: "ops",   box: "pack" },
  cup:    { label: "แก้ว/ชาม",           code: "6220-LS", name: "ค่าแก้ว/ชาม",                 grp: "ops",   box: "pack" },
  straw:  { label: "หลอด/ช้อน/ตะเกียบ",  code: "6230-LS", name: "ค่าหลอด/ช้อน/ตะเกียบ",       grp: "ops",   box: "pack" },
  tissue: { label: "ทิชชู",              code: "6240-LS", name: "ค่าทิชชู/กระดาษเช็ดปาก",      grp: "ops",   box: "pack" },
  clean:  { label: "น้ำยาล้างจาน/ของใช้", code: "6250-LS", name: "ค่าน้ำยาล้างจาน/ทำความสะอาด", grp: "ops",  box: "pack" },

  wage:   { label: "ค่าแรงคนงาน",        code: "6010-LS", name: "ค่าแรงคนงาน",                 grp: "labor", box: "daily" },
  meal:   { label: "ค่าข้าวพนักงาน",     code: "6020-LS", name: "ค่าข้าวพนักงาน",              grp: "labor", box: "daily" },
  fuel:   { label: "ค่าน้ำมัน/ขนส่ง",    code: "6510-LS", name: "ค่าขนส่ง/ค่าน้ำมัน",          grp: "ops",   box: "daily" },
  gas:    { label: "ค่าแก๊ส",            code: "6140-LS", name: "ค่าแก๊ส",                     grp: "ops",   box: "daily" },
};

const BOXES = [
  { key: "fresh", title: "ของสด — ซื้อทุกวัน",         hint: "เนื้อ ผัก ของตลาด น้ำแข็ง" },
  { key: "pack",  title: "บรรจุภัณฑ์และของใช้",         hint: "ซื้อเป็นครั้ง ไม่ใช่ทุกวัน" },
  { key: "daily", title: "ค่าแรงและรายจ่ายรายวัน",      hint: "ค่าแรง ค่าข้าวพนักงาน ค่าน้ำมัน" },
];
const catsIn = (box) => Object.keys(CATS).filter((c) => CATS[c].box === box);

const ACC = {
  "1010-LS": "เงินสดในร้าน",
  "1020-LS": "เงินฝากธนาคาร",
  "1030-LS": "ลูกหนี้ Grab",
  "1031-LS": "ลูกหนี้ไทยช่วยไทย",
  "2010-LS": "เจ้าหนี้การค้า",
  "2100-LS": "เจ้าหนี้ระหว่างกิจการ (ร้านก๋วยเตี๋ยว)",
  "4010-LS": "รายได้ขาย-เงินสด",
  "4020-LS": "รายได้ขาย-เงินโอน",
  "4030-LS": "รายได้ขาย-Grab",
  "4040-LS": "รายได้ขาย-ไทยช่วยไทย",
  "6330-LS": "ค่าคอมมิชชั่นแพลตฟอร์ม",
};
const accName = (c) => ACC[c] || Object.values(CATS).find((x) => x.code === c)?.name || c;

/* ── ร้านค้า + วิธีจ่ายปกติของแต่ละร้าน ──
   ⚠ ข้อมูลสมมติ — ต้องแทนด้วยชื่อร้านจริง */
const VENDORS0 = {
  "เจ๊แดง": "cash",
  "ลุงชิด": "cash",
  "ร้านหมูสด": "cash",
  "ร้านเป็ดพี่นก": "cash",
  "ตลาดสด": "cash",
  "เจ๊หมวย": "cash",
  "ร้านชำ": "transfer",
  [NS]: "ns",
  "—": "cash",
};

/* [ชื่อ, หมวด, หน่วย, ร้าน, ราคาเมื่อวาน, จำนวนเมื่อวาน]
   ⚠ ข้อมูลสมมติทั้งหมด — ต้องแทนด้วยของจริงทีละหมวด */
const CATALOG = [
  ["เนื้อออส", "meat", "กก.", "เจ๊แดง", 360, 3.5],
  ["เนื้อคอย่าง", "meat", "กก.", "ลุงชิด", 310, 3],
  ["ไส้อ่อน", "meat", "กก.", "ร้านหมูสด", 240, 2],
  ["ผ้าขี้ริ้ว", "meat", "กก.", "เจ๊แดง", 155, 4],
  ["สันนอก", "meat", "กก.", "เจ๊แดง", 275, 0],
  ["ตับ", "meat", "กก.", "ร้านหมูสด", 150, 3],
  ["หนังหมูหั่น", "meat", "กก.", "ร้านหมูสด", 80, 4],
  ["ไส้เป็ด", "meat", "กก.", "ร้านเป็ดพี่นก", 190, 0],
  ["เนื้อ (รับจากร้านก๋วยเตี๋ยว)", "meat", "กก.", NS, 340, 0],

  ["ผักชี", "veg", "กก.", "ตลาดสด", 60, 2],
  ["ต้นหอม", "veg", "กก.", "ตลาดสด", 50, 2],
  ["พริกสด", "veg", "กก.", "ตลาดสด", 90, 2],
  ["หอมแดง", "veg", "กก.", "ตลาดสด", 75, 0],
  ["มะนาว", "veg", "กก.", "ตลาดสด", 50, 4],
  ["ตะไคร้", "veg", "กก.", "ตลาดสด", 40, 0],

  ["ข้าวสาร", "market", "กก.", NS, 32, 25],
  ["ขนมจีน", "market", "กก.", "เจ๊หมวย", 45, 5],
  ["น้ำจิ้ม", "market", "ถุง", NS, 30, 10],
  ["น้ำปลา", "market", "ขวด", "ร้านชำ", 60, 0],
  ["ข้าวคั่ว", "market", "กก.", "เจ๊หมวย", 80, 0],
  ["พริกป่น", "market", "กก.", "ร้านชำ", 180, 0],

  ["น้ำแข็ง", "bev", "ถุง", NS, 25, 6],
  ["น้ำดื่ม", "bev", "แพ็ค", "ร้านชำ", 60, 4],
  ["โซดา", "bev", "ลัง", "ร้านชำ", 180, 0],
  ["น้ำอัดลม", "bev", "ลัง", "ร้านชำ", 210, 0],

  ["ถุงพลาสติก", "bag", "แพ็ค", NS, 60, 5],
  ["ยางรัด", "bag", "ถุง", NS, 30, 2],
  ["กล่องข้าว", "bag", "แพ็ค", "ร้านชำ", 125, 0],
  ["ถุงใส 3x5", "bag", "ห่อ", "ร้านชำ", 35, 0],
  ["ถุงใส 6x9", "bag", "ห่อ", "ร้านชำ", 48, 0],
  ["ถุงใส 7x11", "bag", "ห่อ", "ร้านชำ", 55, 0],
  ["ถุงขุ่น 6x9", "bag", "ห่อ", "ร้านชำ", 45, 0],
  ["ถุงหิ้ว 6x14", "bag", "ห่อ", "ร้านชำ", 40, 0],
  ["ถุงหิ้ว 12x20", "bag", "ห่อ", "ร้านชำ", 65, 0],

  ["แก้วน้ำพลาสติก", "cup", "ห่อ", "ร้านชำ", 70, 0],
  ["ชามพลาสติก", "cup", "ห่อ", "ร้านชำ", 85, 0],
  ["จานกระดาษ", "cup", "ห่อ", "ร้านชำ", 60, 0],

  ["ช้อนพลาสติก", "straw", "ห่อ", NS, 45, 4],
  ["หลอดสั้น", "straw", "ห่อ", "ร้านชำ", 28, 0],
  ["หลอดยาว", "straw", "ห่อ", "ร้านชำ", 32, 0],
  ["ไม้จิ้ม/ตะเกียบ", "straw", "ห่อ", "ร้านชำ", 40, 0],

  ["ทิชชู", "tissue", "แพ็ค", "ร้านชำ", 55, 0],
  ["กระดาษเช็ดมือ", "tissue", "แพ็ค", "ร้านชำ", 65, 0],

  ["น้ำยาล้างจาน", "clean", "แกลลอน", NS, 100, 2],
  ["ถุงขยะ", "clean", "แพ็ค", "ร้านชำ", 60, 0],
  ["ฟองน้ำ", "clean", "แพ็ค", "ร้านชำ", 35, 0],

  ["ค่าแรงคนงาน", "wage", "วัน", "—", 3500, 1],
  ["ค่าข้าวพนักงาน", "meal", "วัน", "—", 300, 1],
  ["ค่าน้ำมันไปตลาด", "fuel", "ครั้ง", "—", 0, 0],
  ["ค่าแก๊ส", "gas", "ถัง", "ร้านชำ", 420, 0],
];

/* ราคาที่เคยซื้อจากแต่ละร้าน (ปุ่ม "เทียบ") — ข้อมูลสมมติ */
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

/* ═══════════ helper ═══════════ */
const A = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round(n * 100) / 100;
const s2 = (n) => String(r2(n));
const has = (v) => v !== "" && v !== null && v !== undefined && v !== "-";
/* แสดงเงิน: เต็มบาทไม่โชว์ .00 · มีเศษโชว์ 2 ตำแหน่ง */
const money = (n) => {
  const v = r2(n);
  return v.toLocaleString("th-TH", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};
const dec = (n) => r2(n).toLocaleString("th-TH", { maximumFractionDigits: 2 });
const pct = (n, d) => (d > 0 ? ((n / d) * 100).toFixed(1) + "%" : "—");
/* เก็บตามที่พิมพ์ · ยอมให้ติดลบ · จุดเดียว · ทศนิยมไม่เกิน 2 ตำแหน่ง
   (จำกัด 2 ตำแหน่งเพื่อให้เลขที่เห็นบนจอ = เลขที่ระบบใช้คำนวณ เสมอ) */
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

const TKEY = { qty: "tq", rate: "tr", amt: "ta" };
const blankRow = (vendor) => ({ qty: "", rate: "", amt: "", tq: false, tr: false, ta: false, vendor, pay: "" });

/* หัวใจของ v14 — ระบบแก้ได้เฉพาะช่องที่ตัวเองเป็นเจ้าของ */
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

/* ═══════════════════════════════════════════════════════════ */
/* ═══════════ ชั้นเก็บข้อมูลในเครื่อง ═══════════
   เก็บใน localStorage ของเบราว์เซอร์เครื่องนี้
   ถ้าเปิดในที่ที่เก็บไม่ได้ (เช่น artifact ใน Claude) ระบบยังใช้ได้ปกติ
   แค่ข้อมูลไม่ค้างข้ามวัน — และจะขึ้นแถบเตือนให้เห็นชัด */
const KEY = "laab-ls-v1";
const canStore = (() => {
  try { const k = "__t"; window.localStorage.setItem(k, "1"); window.localStorage.removeItem(k); return true; }
  catch (e) { return false; }
})();
const loadDB = () => {
  if (!canStore) return null;
  try { return JSON.parse(window.localStorage.getItem(KEY)) || null; } catch (e) { return null; }
};
const saveDB = (db) => {
  if (!canStore) return false;
  try { window.localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch (e) { return false; }
};
const freshDay = () => ({ rows: {}, rev: { cash: "", transfer: "", grab: "", thai: "" }, cashOpen: "", cashCount: "", closed: false });
const seedCatalog = () => CATALOG.map(([name, cat, unit, vendor, yRate, yQty], i) =>
  ({ id: i + 1, name, cat, unit, vendor, yRate, yQty }));

/* ═══════════════════════════════════════════════════════════ */
export default function LaabEntryV15() {
  /* ── ฐานข้อมูลในเครื่อง ── */
  const [db, setDb] = useState(() => {
    const d = loadDB();
    return {
      v: 1,
      catalog: (d && d.catalog) || seedCatalog(),
      vendors: (d && d.vendors) || VENDORS0,
      grabPct: (d && d.grabPct) != null ? d.grabPct : "10",
      days: (d && d.days) || {},
    };
  });
  const [storeOk, setStoreOk] = useState(canStore);
  useEffect(() => { if (canStore && !saveDB(db)) setStoreOk(false); }, [db]);

  const [date, setDate] = useState(() => {
    const d = loadDB();
    const ks = d && d.days ? Object.keys(d.days).sort() : [];
    return ks.length ? ks[ks.length - 1] : new Date().toISOString().slice(0, 10);
  });

  const catalog = db.catalog;
  const vendors = db.vendors;
  const grabPct = db.grabPct;
  const day = db.days[date] || freshDay();
  const rev = day.rev;
  const savedDates = useMemo(() => Object.keys(db.days).sort().reverse(), [db.days]);

  const setDay = (fn) => setDb((p) => {
    const cur = p.days[date] || freshDay();
    return { ...p, days: { ...p.days, [date]: fn(cur) } };
  });
  const setRows = (fn) => setDay((d) => ({ ...d, rows: typeof fn === "function" ? fn(d.rows) : fn }));
  const setRev = (fn) => setDay((d) => ({ ...d, rev: typeof fn === "function" ? fn(d.rev) : fn }));
  const setCatalog = (fn) => setDb((p) => ({ ...p, catalog: typeof fn === "function" ? fn(p.catalog) : fn }));
  const setVendors = (fn) => setDb((p) => ({ ...p, vendors: typeof fn === "function" ? fn(p.vendors) : fn }));
  const setGrabPct = (v) => setDb((p) => ({ ...p, grabPct: v }));
  const setCashOpen = (v) => setDay((d) => ({ ...d, cashOpen: v }));
  const setCashCount = (v) => setDay((d) => ({ ...d, cashCount: v }));

  /* ── "เมื่อวาน" = ครั้งล่าสุดก่อนวันนี้ที่ซื้อของชิ้นนั้นจริง ── */
  const prevOf = useMemo(() => {
    const back = Object.keys(db.days).filter((d) => d < date).sort().reverse();
    const map = {};
    catalog.forEach((it) => {
      for (const d of back) {
        const r = db.days[d].rows && db.days[d].rows[it.id];
        if (r && has(r.amt) && has(r.rate) && A(r.rate) !== 0) {
          map[it.id] = { rate: String(r.rate), qty: String(r.qty || ""), vendor: r.vendor, pay: r.pay, when: d };
          return;
        }
      }
      map[it.id] = it.yRate
        ? { rate: String(it.yRate), qty: String(it.yQty || ""), vendor: it.vendor, pay: "", when: null }
        : { rate: "", qty: "", vendor: it.vendor, pay: "", when: null };
    });
    return map;
  }, [db.days, catalog, date]);

  /* เงินสดยกมา: ถ้ายังไม่ใส่ ใช้ยอดนับได้ของวันก่อนหน้าอัตโนมัติ */
  const prevCash = useMemo(() => {
    const back = Object.keys(db.days).filter((d) => d < date).sort().reverse();
    for (const d of back) if (has(db.days[d].cashCount)) return { v: db.days[d].cashCount, when: d };
    return null;
  }, [db.days, date]);
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
  const [editCat, setEditCat] = useState(null);

  const rowRef = useRef({});
  const taRef = useRef(null);
  const fileRef = useRef(null);

  const closed = !!day.closed;
  const setClosed = (v) => setDay((d) => ({ ...d, closed: v }));

  /* แถวที่ยังไม่ถูกแตะ = ราคาเติมจากครั้งก่อน */
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
    const seed = R(id);                       // แถวที่ยังไม่ถูกแตะ = ราคาเติมจากครั้งก่อน
    setRows((p) => {
      const r = { ...(p[id] || seed), [field]: v };
      r[TKEY[field]] = v !== "";
      return { ...p, [id]: recalc(r) };
    });
    dirty();
  };

  /* ── แก้ข้อขัดแย้ง ── */
  const resolve = (id, keep) => {
    const seed = R(id);
    setRows((p) => {
      const r = { ...(p[id] || seed) };
      if (keep === "amt") r.tr = false;   // ยอดรวมถูก → ให้ระบบคำนวณราคาใหม่
      else r.ta = false;                  // ราคาถูก → ให้ระบบคำนวณยอดรวมใหม่
      return { ...p, [id]: recalc(r) };
    });
    dirty();
  };

  const setVend = (id, v) => {
    const name = v.trim() || "—";
    const seed = R(id);
    setVendors((p) => (p[name] ? p : { ...p, [name]: "cash" }));
    setRows((p) => ({ ...p, [id]: { ...(p[id] || seed), vendor: name } }));
    dirty();
  };
  const setPay = (id, v) => {
    const seed = R(id);
    setRows((p) => ({ ...p, [id]: { ...(p[id] || seed), pay: v } }));
    dirty();
  };
  const payOf = (r) => r.pay || vendors[r.vendor] || "cash";

  /* ── แสดงตัวเลข: จัดรูปเฉพาะตอนไม่ได้พิมพ์อยู่ ── */
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

  /* ── ปุ่มเครื่องมือ ── */
  const resetRates = () => {
    /* ข้ามแถวที่พิมพ์ทั้งจำนวนและยอดรวมเอง — ราคาถูกล็อกด้วยเลขคณิตไปแล้ว
       (ยอดรวม ÷ จำนวน) ถ้าฝืนใส่ราคาครั้งก่อนทับ ตัวเลขในแถวจะขัดกันเอง */
    const locked = catalog.filter((it) => prevOf[it.id].rate && R(it.id).ta && R(it.id).tq);
    setRows((p) => {
      const o = { ...p };
      catalog.forEach((it) => {
        const pr = prevOf[it.id].rate;
        if (!pr) return;                             // ไม่มีราคาครั้งก่อน → ไม่แตะ
        const cur = o[it.id] || R(it.id);
        if (cur.ta && cur.tq) return;                // ล็อกด้วยเลขคณิต → ไม่แตะ
        o[it.id] = recalc({ ...cur, rate: pr, tr: false });
      });
      return o;
    });
    dirty();
    setResetNote(locked.length
      ? `คืนราคาครั้งก่อนแล้ว — ข้าม ${locked.length} รายการที่พิมพ์ทั้งจำนวนและยอดรวมเอง (${locked.map((x) => x.name).join(", ")}) เพราะราคาต้องคิดจากยอดที่พิมพ์`
      : "");
  };

  const clearQty = () => {
    setRows((p) => {
      const o = { ...p };
      catalog.forEach((it) => {
        const cur = o[it.id] || R(it.id);
        o[it.id] = recalc({ ...cur, qty: "", tq: false, amt: "", ta: false });
      });
      return o;
    });
    dirty();
  };

  const addItem = () => {
    const name = nn.trim();
    if (!name || !newFor) return;
    const vendor = nv.trim() || "—";
    setVendors((p) => (p[vendor] ? p : { ...p, [vendor]: "cash" }));
    const id = Math.max(0, ...catalog.map((c) => c.id)) + 1;
    setCatalog((p) => [...p, { id, name, cat: newFor, unit: nu.trim() || "ชิ้น", vendor, yRate: 0, yQty: 0 }]);
    setRows((p) => ({ ...p, [id]: blankRow(vendor) }));
    setNn(""); setNu(""); setNv(""); dirty();
  };

  /* ── แก้ไขรายการของ (ตั้งค่าครั้งเดียว เก็บในเครื่อง) ── */
  const patchItem = (id, patch) =>
    setCatalog((p) => p.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  /* ── รายการที่ใช้งานจริงวันนี้ ── */
  const active = useMemo(
    () => catalog.filter((it) => { const r = R(it.id); return A(r.amt) !== 0 || A(r.qty) !== 0; })
      .map((it) => ({ ...it, ...R(it.id) })),
    [catalog, day.rows, prevOf]);

  /* แถวกรอกค้าง: มีจำนวนแต่ยังไม่มียอดเงิน */
  const pending = useMemo(
    () => catalog.filter((it) => { const r = R(it.id); return A(r.qty) !== 0 && !has(r.amt); }),
    [catalog, day.rows, prevOf]);

  const conflicts = useMemo(
    () => catalog.filter((it) => isConflict(R(it.id))), [catalog, day.rows, prevOf]);

  const inCat = (c) => catalog.filter((it) => it.cat === c && (!it.off || editCat === c));
  const catTotal = (c) => inCat(c).reduce((s, it) => s + A(R(it.id).amt), 0);
  const catCount = (c) => inCat(c).filter((it) => A(R(it.id).qty) !== 0 || A(R(it.id).amt) !== 0).length;

  const priceFlag = (it) => {
    const pv = prevOf[it.id];
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

  /* ── ตัวเลขรวม ── */
  const grabGross = A(rev.grab);
  const grabComm = r2(grabGross * A(grabPct) / 100);
  const grabNet = r2(grabGross - grabComm);
  const totalIn = r2(A(rev.cash) + A(rev.transfer) + grabGross + A(rev.thai));

  const totalOut = r2(active.reduce((s, l) => s + A(l.amt), 0));
  const byGrp = (g) => r2(active.filter((l) => CATS[l.cat].grp === g).reduce((s, l) => s + A(l.amt), 0));
  const food = byGrp("food"), bevT = byGrp("bev"), labor = byGrp("labor"), ops = byGrp("ops");
  const prime = r2(food + bevT + labor);
  const nsTotal = r2(active.filter((l) => payOf(l) === "ns").reduce((s, l) => s + A(l.amt), 0));
  const cashPaid = r2(active.filter((l) => PAY[payOf(l)].out).reduce((s, l) => s + A(l.amt), 0));
  const profit = r2(totalIn - totalOut - grabComm);
  const cashShould = r2(A(cashOpen) + A(rev.cash) - cashPaid);
  const cashDiff = has(cashCount) ? r2(A(cashCount) - cashShould) : null;

  /* ── สมุดรายวัน ── */
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
      if (!sub.length) return;
      const agg = {};
      sub.forEach((l) => { agg[CATS[l.cat].code] = r2((agg[CATS[l.cat].code] || 0) + A(l.amt)); });
      const drLines = Object.entries(agg).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([code, dr]) => ({ code, dr, cr: 0 }));
      const total = r2(drLines.reduce((s, l) => s + l.dr, 0));
      out.push({
        no: no + "-" + "BCDE"[i], title: TITLE[k],
        lines: [...drLines, { code: PAY[k].code, dr: 0, cr: total }],
      });
    });
    return out;
  }, [active, day.rows, rev, grabPct, date, vendors]);

  const sumDr = r2(journals.reduce((s, j) => s + j.lines.reduce((a, l) => a + l.dr, 0), 0));
  const sumCr = r2(journals.reduce((s, j) => s + j.lines.reduce((a, l) => a + l.cr, 0), 0));
  const balanced = Math.abs(sumDr - sumCr) < 0.005 && sumDr > 0;

  /* ── ข้อความสรุปไว้คัดลอก ── */
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
  }, [date, rev, grabPct, active, day.rows, journals, cashOpen, cashCount, vendors]);

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

  /* ── เปลี่ยนวันที่: ข้อมูลถูกเก็บอัตโนมัติ เปลี่ยนวันคือโหลดวันนั้นขึ้นมา ── */
  const shiftDay = (n) => {
    const t = new Date(date + "T00:00:00");
    t.setDate(t.getDate() + n);
    setDate(t.toISOString().slice(0, 10));
  };
  const dayHasData = (d) => {
    const x = db.days[d]; if (!x) return false;
    return Object.values(x.rows || {}).some((r) => A(r.amt) !== 0) ||
      Object.values(x.rev || {}).some((v) => A(v) !== 0);
  };
  const deleteDay = (d) => setDb((p) => { const n = { ...p.days }; delete n[d]; return { ...p, days: n }; });

  /* ── สำรอง / กู้ข้อมูล ── */
  const backup = () => {
    const blob = new Blob([JSON.stringify(db, null, 1)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laab-LS-สำรองข้อมูล-${date}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restore = (file) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const d = JSON.parse(String(fr.result));
        if (!d || !d.days) throw new Error("รูปแบบไฟล์ไม่ถูก");
        setDb({ v: 1, catalog: d.catalog || seedCatalog(), vendors: d.vendors || VENDORS0,
                grabPct: d.grabPct != null ? d.grabPct : "10", days: d.days });
        const ks = Object.keys(d.days).sort();
        if (ks.length) setDate(ks[ks.length - 1]);
        setResetNote(`กู้ข้อมูลสำเร็จ — ${Object.keys(d.days).length} วัน`);
      } catch (e) {
        setResetNote("ไฟล์นี้อ่านไม่ได้ — ต้องเป็นไฟล์สำรองที่ดาวน์โหลดจากหน้านี้");
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
        onChange={(e) => { const v = e.target.value.trim() || "—"; setVendors((p) => (p[v] ? p : { ...p, [v]: "cash" })); patchItem(it.id, { vendor: v }); }} />
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
            {!on && A(prevOf[it.id].qty) > 0 && (
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
.dright{display:flex;align-items:center;gap:9px}
.dtext{font-size:12.5px;color:var(--soft);font-weight:600}
.navb{font-family:'Sarabun',sans-serif;font-size:14px;line-height:1;padding:6px 9px;border:1px solid var(--rule);
 background:#fff;color:var(--ink);border-radius:3px;cursor:pointer}
.navb:hover{background:var(--field)}
.navb.wide{font-size:11.5px;font-weight:600}
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
        <h1>ร้านอีสาน/ลาบ<span className="sub">บันทึกรายวัน · สาขา LS · v15</span></h1>
        <div className="dright">
          <button className="navb" onClick={() => shiftDay(-1)} aria-label="วันก่อนหน้า">‹</button>
          <span className="dtext">{thDate(date)}</span>
          <button className="navb" onClick={() => shiftDay(1)} aria-label="วันถัดไป">›</button>
          <input className="dateinput" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button className="navb wide" onClick={() => setShowDays(!showDays)}>
            วันที่บันทึกไว้ {savedDates.filter(dayHasData).length}
          </button>
        </div>
      </div>

      {!storeOk && (
        <div className="alertbar amber" style={{ marginBottom: 14 }}>
          ⚠ หน้าจอนี้เก็บข้อมูลลงเครื่องไม่ได้ — ปิดแท็บแล้วข้อมูลหาย ต้องกด "ปิดยอดวันนี้" แล้วคัดลอกเก็บเองทุกวัน
          <br />(ถ้าอยากให้เก็บได้ ต้องเปิดจากไฟล์ HTML หรือลิงก์เว็บ ไม่ใช่ดูในแอปแชท)
        </div>
      )}

      {showDays && (
        <div className="card">
          <p className="eyebrow">
            <span>วันที่บันทึกไว้ในเครื่องนี้</span>
            <span className="plain">
              <button className="tbtn ghost" onClick={backup}>ดาวน์โหลดสำรองข้อมูล</button>{" "}
              <button className="tbtn ghost" onClick={() => fileRef.current && fileRef.current.click()}>กู้จากไฟล์สำรอง</button>
              <input ref={fileRef} type="file" accept=".json" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) restore(f); e.target.value = ""; }} />
            </span>
          </p>
          {savedDates.filter(dayHasData).length === 0 ? (
            <p style={{ fontSize: 12.5, color: "var(--soft)", margin: 0 }}>ยังไม่มีวันไหนบันทึกไว้</p>
          ) : savedDates.filter(dayHasData).map((d) => {
            const x = db.days[d];
            const inn = Object.values(x.rev || {}).reduce((a, v) => a + A(v), 0);
            const outn = Object.values(x.rows || {}).reduce((a, r) => a + A(r.amt), 0);
            return (
              <div className={`dayrow${d === date ? " cur" : ""}`} key={d}>
                <button className="dayjump" onClick={() => { setDate(d); setShowDays(false); }}>
                  {thDate(d)}{x.closed ? " ✓" : ""}
                </button>
                <span className="dayv">รับ {money(inn)}</span>
                <span className="dayv">จ่าย {money(outn)}</span>
                <button className="daydel" onClick={() => deleteDay(d)} aria-label={`ลบข้อมูล ${thDate(d)}`}>ลบ</button>
              </div>
            );
          })}
          <p className="foot" style={{ marginTop: 10 }}>
            ข้อมูลเก็บอยู่ในเบราว์เซอร์เครื่องนี้เท่านั้น — ล้างข้อมูลเบราว์เซอร์หรือเปลี่ยนเครื่องแล้วหาย
            <b> ควรกดดาวน์โหลดสำรองข้อมูลเก็บไว้อาทิตย์ละครั้ง</b>
          </p>
        </div>
      )}

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
                    onChange={(e) => { setRev((p) => ({ ...p, [k]: numStr(e.target.value) })); dirty(); }} />
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
                      {isOpen(c) && (
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

          <button className="btn" onClick={() => setClosed(true)}>ปิดยอดวันนี้</button>

          {closed && (
            <div className="savebox">
              <h4>✓ ปิดยอด {thDate(date)} แล้ว — {active.length} รายการ · {journals.length} ใบสำคัญ</h4>
              {storeOk
                ? <p className="ok2">✓ ข้อมูลเก็บในเครื่องนี้แล้ว — คัดลอกด้านล่างไว้ส่งนักบัญชี หรือเก็บใน Excel ก็ได้</p>
                : <p className="warn2">⚠ เครื่องนี้เก็บข้อมูลไม่ได้ — ต้องคัดลอกไปวางใน Excel ก่อนปิดหน้าจอ ไม่งั้นหาย</p>}
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
              ราคา "ครั้งก่อน" ดึงจากวันที่บันทึกไว้จริง ยิ่งใช้ยิ่งแม่น<br />
              <b style={{ color: "var(--margin)" }}>ชื่อร้าน ราคาตั้งต้น และรายการของ ยังเป็นข้อมูลสมมติ — ต้องแทนด้วยของจริง</b>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
