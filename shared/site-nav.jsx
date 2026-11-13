// แถบเมนูกิจการ ใช้ร่วมทุกหน้า (คลังกลาง · ร้านลาบ · FT · ลูกชิ้นปิ้ง) — บอสหนึ่งตกลง 13 พ.ย. 2569 01:40 (เรียงคลังกลางก่อน · แบบ ข วันที่ตามไปด้วย)
// 13 พ.ย. 11:46 บอสวาดให้ดู → แท็บแบบแฟ้มเอกสาร (1ข: มีแค่เส้นใต้แท็บ เนื้อหาเต็มจอ · 2ก: สำรองข้อมูลเป็นลิงก์เล็กด้านขวา)
// ใช้: <SiteNav current="wh|ls|ft|gbs|gbk|ns" date="YYYY-MM-DD" pageBg="#FBFAF6" />  · pageBg = สีพื้นส่วนที่อยู่ใต้แถบ (แท็บที่เปิดจะกลืนกับพื้นนี้)
// หน้าที่รับวันที่: initialDate() อ่าน ?d= จากลิงก์ · FT: ft-build/build.sh คัดไฟล์นี้ไปไว้ที่ src/site-nav.jsx ตอน build
import React, { useEffect } from "react";

const TABS = [
  ["wh", "คลังกลาง", "wh/"],
  ["ls", "ร้านลาบ", ""],
  ["ft", "โรงลูกชิ้น", "ft/"],
  ["gbs", "ซัน", "gb/?ent=GBS"],
  ["gbk", "เกด", "gb/?ent=GBK"],
  ["ns", "ก๋วยเตี๋ยว", "ns/"],   // 13 พ.ย. 2569 หน้าร้านก๋วยเตี๋ยว (ใช้หน้าร้านลาบเป็นแม่แบบ)
];
const BACKUP = "backup/";
const LINE = "#B3AC9C", TAB_BG = "#E9E4D6", INK = "#1E2A24", SOFT = "#56665D", SLANT = 14;
const SHAPE = `polygon(${SLANT}px 0, 100% 0, 100% 100%, 0 100%)`;   // ขอบซ้ายเฉียงแบบแฟ้ม ขอบขวาตรง
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

// ช่องว่างซ้าย/ขวาของแถบ มีเส้นล่าง (เส้นใต้แท็บต่อกันตลอดแถว)
const Filler = ({ grow, children }) => (
  <span style={{ flex: grow ? "1 0 auto" : "0 0 10px", alignSelf: "stretch", display: "flex", alignItems: "center", justifyContent: "flex-end",
    borderBottom: "1px solid " + LINE, boxSizing: "border-box" }}>{children}</span>
);

export default function SiteNav({ current, date, pageBg = "#FBFAF6" }) {
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
    <nav aria-label="กิจการ" style={{ display: "flex", alignItems: "flex-end", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none",
      WebkitOverflowScrolling: "touch", padding: "10px 0 0", margin: 0, background: pageBg, fontFamily: "inherit", position: "relative", zIndex: 5 }}>
      <Filler />
      {TABS.map(([k, name, path], i) => {
        const on = k === current;
        return (
          <a key={k} href={siteLink(path, date)} aria-current={on ? "page" : undefined}
            style={{ position: "relative", flex: "0 0 auto", display: "inline-flex", alignItems: "center", boxSizing: "border-box",
              minHeight: on ? 48 : 44, padding: `0 20px 0 ${SLANT + 12}px`, marginLeft: i ? -(SLANT - 4) : 0, zIndex: on ? 3 : 1,
              fontSize: 16, lineHeight: 1.2, whiteSpace: "nowrap", textDecoration: "none", color: on ? INK : SOFT, fontWeight: on ? 700 : 500 }}>
            {/* ชั้นนอก = สีเส้นขอบ · ชั้นใน = สีแท็บ หดเข้า 1px · แท็บที่เปิดไม่มีเส้นล่าง → กลืนเป็นผืนเดียวกับหน้า */}
            <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: LINE, clipPath: SHAPE, zIndex: -1 }} />
            <span aria-hidden="true" style={{ position: "absolute", top: 1, right: 1, left: 1, bottom: on ? 0 : 1,
              background: on ? pageBg : TAB_BG, clipPath: SHAPE, zIndex: -1 }} />
            {name}
          </a>
        );
      })}
      <Filler grow>
        <a href={siteBase() + BACKUP} style={{ color: SOFT, fontSize: 14, textDecoration: "underline", padding: "0 12px", minHeight: 44,
          display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>สำรองข้อมูล</a>
      </Filler>
    </nav>
  );
}
