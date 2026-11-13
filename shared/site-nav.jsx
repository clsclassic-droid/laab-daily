// แถบเมนูกิจการ ใช้ร่วมทุกหน้า (คลังกลาง · ร้านลาบ · FT · ลูกชิ้นปิ้ง) — บอสหนึ่งตกลง 13 พ.ย. 2569 01:40 (เรียงคลังกลางก่อน · แบบ ข วันที่ตามไปด้วย)
// ใช้: <SiteNav current="wh|ls|ft|gbs|gbk" date="YYYY-MM-DD" />  · หน้าที่รับวันที่: initialDate() อ่าน ?d= จากลิงก์
// FT: ft-build/build.sh คัดไฟล์นี้ไปไว้ที่ src/site-nav.jsx ตอน build
import React, { useEffect } from "react";

const PAGES = [
  ["wh", "คลังกลาง", "wh-test/"],
  ["ls", "ร้านลาบ", ""],
  ["ft", "โรงลูกชิ้น", "ft/"],
  ["gbs", "ซัน", "gb-test/?ent=GBS"],
  ["gbk", "เกด", "gb-test/?ent=GBK"],
  ["backup", "สำรองข้อมูล", "backup/"],
];
const okDate = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

// โฟลเดอร์หลักของเว็บ เช่น /laab-daily/
function siteBase() {
  const p = window.location.pathname, i = p.indexOf("/laab-daily/");
  return i >= 0 ? p.slice(0, i + 12) : "/";
}
export function siteLink(path, date) {
  if (!okDate(date) || path.startsWith("backup")) return siteBase() + path;
  return siteBase() + path + (path.includes("?") ? "&" : "?") + "d=" + date;
}
// วันที่ที่ส่งมากับลิงก์ (?d=) ถ้าไม่มี/ผิด ใช้ค่าที่ให้มา (ปกติ = วันนี้)
export function initialDate(fallback) {
  try { const d = new URLSearchParams(window.location.search).get("d"); return okDate(d) ? d : fallback; } catch { return fallback; }
}
export function initialParam(name, allowed, fallback) {
  try { const v = new URLSearchParams(window.location.search).get(name); return allowed.includes(v) ? v : fallback; } catch { return fallback; }
}

export default function SiteNav({ current, date, extra }) {
  // เก็บวันที่ (และ ent ของลูกชิ้นปิ้ง) ไว้ในที่อยู่เว็บ → รีเฟรชแล้วอยู่วันเดิม
  useEffect(() => {
    if (!okDate(date)) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("d", date);
      if (current === "gbs" || current === "gbk") u.searchParams.set("ent", current.toUpperCase());
      window.history.replaceState(window.history.state, "", u.toString());
    } catch { /* ไม่เป็นไร */ }
  }, [date, current]);
  return (
    <nav aria-label="กิจการ" style={{ display: "flex", gap: 8, overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", padding: "8px 12px", margin: 0, background: "#f3efe6",
      borderBottom: "1px solid #e2dccd", WebkitOverflowScrolling: "touch", fontFamily: "inherit", position: "relative", zIndex: 5 }}>
      {PAGES.map(([k, name, path]) => {
        const on = k === current;
        return (
          <a key={k} href={siteLink(path, date)} aria-current={on ? "page" : undefined}
            style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", minHeight: 44, boxSizing: "border-box", padding: "0 16px", borderRadius: 999, fontSize: 16, lineHeight: 1.2, textDecoration: "none", whiteSpace: "nowrap",
              border: "1px solid " + (on ? "#1f2a22" : "#cfc8b8"), background: on ? "#1f2a22" : "#fff", color: on ? "#fff" : "#1f2a22",
              fontWeight: on ? 700 : 500, marginLeft: k === "backup" ? "auto" : 0 }}>
            {name}
          </a>
        );
      })}
      {extra}
    </nav>
  );
}
