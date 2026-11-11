// หน้า "สำรองข้อมูล" — ดาวน์โหลดข้อมูลทุกตารางเป็นไฟล์เดียว
// ดึงทีละ 1,000 แถว (Supabase ตัดเหลือ 1,000 แถวโดยไม่เตือน) แล้วนับเทียบกับจำนวนแถวจริงทุกตาราง
import { supabase } from "../supabaseClient.js";

// ตารางทั้งหมดใน public + คอลัมน์ที่ใช้เรียงลำดับ (primary key)
// ⚠️ เพิ่มตารางใหม่ (เช่น NS / GB) ต้องเพิ่มชื่อที่นี่ด้วย
const TABLES = [
  ["accounts", "code"], ["settings", "entity"], ["profiles", "id"], ["stores", "id"], ["items", "id"],
  ["employees", "id"], ["journal_entries", "id"], ["journal_lines", "id"],
  ["daily_sales", "id"], ["daily_purchases", "id"], ["cash_counts", "id"],
  ["staff_attendance", "id"], ["staff_advances", "id"], ["payroll_months", "id"],
  ["monthly_expenses", "id"], ["vendor_payments", "id"],
  ["ft_products", "id"], ["ft_prices", "id"], ["ft_customers", "id"],
  ["ft_sales", "id"], ["ft_sale_items", "id"], ["ft_receipts", "id"],
  ["ft_production", "id"], ["ft_stock_moves", "id"], ["ft_stock_counts", "id"],
  ["ft_employees", "id"], ["ft_employee_rates", "id"], ["ft_attendance", "id"],
  ["ft_wage_adjustments", "id"], ["ft_labor_payments", "id"],
  ["ft_materials", "id"], ["ft_material_payments", "id"], ["ft_operations", "op_id"],
  ["inv_locations", "code"], ["inv_items", "id"], ["inv_sale_items", "id"],
  ["inv_moves", "id"], ["inv_counts", "id"],
];
const PAGE = 1000;

const $ = (s) => document.querySelector(s);
const fmt = (n) => Number(n).toLocaleString("th-TH");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function stamp() {
  const d = new Date(Date.now() + 7 * 3600000); // เวลาไทย
  return d.toISOString().slice(0, 16).replace("T", "-").replace(":", "");
}

async function countRows(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${table}: นับแถวไม่ได้ (${error.message})`);
  return count ?? 0;
}

async function fetchAll(table, pk, onPage) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select("*").order(pk, { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table} แถว ${from}: ${error.message}`);
    rows.push(...(data || []));
    onPage(rows.length);
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

function renderRows(state) {
  $("#list").innerHTML = state.map((t) => {
    const icon = t.status === "ok" ? "✅" : t.status === "bad" ? "❌" : t.status === "run" ? "⏳" : "·";
    const right = t.count == null ? "" : `${fmt(t.got ?? 0)} / ${fmt(t.count)} แถว`;
    return `<tr class="${t.status}"><td>${icon}</td><td>${esc(t.name)}</td><td class="num">${right}</td><td class="err">${esc(t.err || "")}</td></tr>`;
  }).join("");
}

async function runBackup() {
  const btn = $("#go");
  btn.disabled = true;
  $("#result").innerHTML = "";
  const state = TABLES.map(([name, pk]) => ({ name, pk, status: "", count: null, got: null, err: "" }));
  renderRows(state);
  const parts = [];
  let total = 0, bad = 0;
  const started = new Date();
  for (const t of state) {
    t.status = "run"; renderRows(state);
    try {
      // นับก่อนและหลังดึง ถ้าไม่เท่ากัน (มีคนบันทึกระหว่างดึง) ให้ดึงใหม่ 1 ครั้ง
      for (let attempt = 0; attempt < 2; attempt++) {
        t.count = await countRows(t.name);
        const rows = await fetchAll(t.name, t.pk, (n) => { t.got = n; renderRows(state); });
        const after = await countRows(t.name);
        t.got = rows.length;
        if (rows.length === t.count && after === t.count) {
          parts.push({ name: t.name, json: JSON.stringify({ pk: t.pk, count: rows.length, rows }) });
          total += rows.length;
          t.status = "ok";
          break;
        }
        t.err = `ได้ ${fmt(rows.length)} แถว แต่ในระบบมี ${fmt(after)} แถว`;
        if (attempt === 1) { t.status = "bad"; bad++; }
      }
      if (t.status === "ok") t.err = "";
    } catch (e) {
      t.status = "bad"; t.err = String(e?.message || e); bad++;
    }
    renderRows(state);
  }
  btn.disabled = false;
  if (bad) {
    $("#result").innerHTML = `<p class="red">❌ สำรองไม่ครบ ${bad} ตาราง — ยังไม่สร้างไฟล์ กรุณากดใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งคลอส</p>`;
    return;
  }
  // ประกอบไฟล์เป็นชิ้น ๆ ไม่สร้างข้อความก้อนใหญ่ก้อนเดียว (กันหน่วยความจำ iPad เต็ม)
  const head = JSON.stringify({ app: "laab-accounting", format: 1, created_at: started.toISOString(), tables: TABLES.length, total_rows: total });
  const chunks = [head.slice(0, -1), ',"data":{'];
  parts.forEach((p, i) => { chunks.push((i ? "," : "") + JSON.stringify(p.name) + ":", p.json); });
  chunks.push("}}");
  const blob = new Blob(chunks, { type: "application/json" });
  const name = `backup-laab-${stamp()}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.textContent = "แตะที่นี่ถ้าไฟล์ไม่ดาวน์โหลดเอง";
  $("#result").innerHTML = `<p class="green">✅ ครบทุกตาราง ${TABLES.length} ตาราง รวม ${fmt(total)} แถว · ขนาด ${(blob.size / 1048576).toFixed(1)} MB</p><p>ไฟล์: <b>${esc(name)}</b></p>`;
  $("#result").appendChild(a);
  $("#result").insertAdjacentHTML("beforeend", `<p class="muted">บน iPad ไฟล์จะอยู่ในแอป Files → ดาวน์โหลด แนะนำให้ย้ายไปเก็บใน iCloud Drive</p>`);
  a.click();
}

async function showNightly() {
  const el = $("#nightly");
  const { data, error } = await supabase.from("backup_summary").select("run_date,scope,ok,total_rows,checked_at").order("run_date", { ascending: false }).limit(4);
  if (error) { el.innerHTML = `<span class="muted">สำรองอัตโนมัติทุกคืน: ยังไม่ได้ติดตั้ง</span>`; return; }
  const live = (data || []).find((r) => r.scope === "live");
  if (!live) { el.innerHTML = `<span class="muted">สำรองอัตโนมัติทุกคืน: ยังไม่มีผล (เริ่มคืนนี้ตี 3)</span>`; return; }
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  const yest = new Date(Date.now() + 7 * 3600000 - 86400000).toISOString().slice(0, 10);
  const fresh = live.run_date === today || live.run_date === yest;
  el.innerHTML = live.ok && fresh
    ? `<span class="green">สำรองอัตโนมัติล่าสุด: ${esc(live.run_date)} ✅ ครบทุกตาราง (${fmt(live.total_rows)} แถว)</span>`
    : `<span class="red">⚠️ สำรองอัตโนมัติล่าสุด: ${esc(live.run_date)} ${live.ok ? "(เก่าเกิน 1 วัน)" : "ไม่ครบ"} — แจ้งคลอส</span>`;
}

async function init() {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) {
    $("#app").innerHTML = `<p>ยังไม่ได้เข้าสู่ระบบ — <a href="../">ไปหน้าร้านลาบเพื่อเข้าสู่ระบบ</a> แล้วกลับมาหน้านี้</p>`;
    return;
  }
  $("#who").textContent = data.session.user.email || "";
  $("#go").addEventListener("click", runBackup);
  renderRows(TABLES.map(([name]) => ({ name, status: "", count: null })));
  showNightly();
}
init();
