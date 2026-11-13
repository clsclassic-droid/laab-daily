// ชุดสีกลาง (design tokens) ใช้ร่วม: ร้านลาบ · คลังกลาง · ลูกชิ้นปิ้ง — บอสหนึ่งเลือก 1ก 2ก 13 พ.ย. 2569 16:59
// มาตรฐาน = แบบหน้าคลังกลาง/ลูกชิ้นปิ้ง · FT ไม่ใช้ไฟล์นี้ (คงสีแดงฟ้าแบบเว็บดาวเทียมเดิม ตามที่บอสเลือก 2ก)
// เปลี่ยนสี/ฟอนต์/มุมปุ่มที่นี่ที่เดียว แล้ว build ทุกหน้าที่ใช้ (ร้านลาบ npm run build · wh/ · gb/)
// ใช้: import "./shared/tokens.js" (ใส่ <style id="tokens"> ใน <head> ตอนโหลด) · ใน CSS ใช้ var(--ink) ฯลฯ

export const FONT = 'system-ui,-apple-system,"Noto Sans Thai",sans-serif';

export const TOKENS_CSS = `:root{
  --bg:#FBFAF6;       /* พื้นหน้า สีครีม */
  --card:#fff;        /* พื้นการ์ด/ช่องกรอก */
  --ink:#1E2A24;      /* ตัวหนังสือหลัก เขียวเข้ม */
  --muted:#56665D;    /* ตัวหนังสือรอง (5.8:1 บนครีม) */
  --faint:#8E9A92;    /* เครื่องหมายประกอบ เช่น × = */
  --line:#E4E1D8;     /* เส้นการ์ด/เส้นตาราง */
  --input-line:#C9D3CB; /* ขอบช่องกรอก/ปุ่มรอง */
  --field:#F1F4EE;    /* พื้นช่องกรอกตัวเลข/แถวที่เลือก */
  --green:#1F7A4D;    /* ผ่าน/กำไร */
  --red:#B3261E;      /* ผิด/ขาดทุน/ลบ */
  --warn:#FFF4D6;     /* พื้นแถบเตือน */
  --font:${FONT};
  --r-card:12px; --r-btn:10px; --r-input:8px; --r-chip:6px;
  --tap:44px;         /* ความสูงปุ่มหลัก */
}`;

if (typeof document !== "undefined" && !document.getElementById("tokens")) {
  const s = document.createElement("style");
  s.id = "tokens";
  s.textContent = TOKENS_CSS;
  document.head.prepend(s);
}
