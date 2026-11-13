import { createClient } from "@supabase/supabase-js";

/* ค่าสำหรับต่อ Supabase — โปรเจกต์ laab-accounting
   URL และ publishable key ปลอดภัยที่จะฝังในโค้ดฝั่ง client (ไม่ใช่ secret)
   สิทธิ์เข้าถึงข้อมูลจริงคุมด้วย Row Level Security ที่ฝั่งฐานข้อมูล ไม่ใช่คีย์นี้ */
const SUPABASE_URL = "https://fzlkeqyqnvljcoujsiow.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oNiAlvt0TZEaVdSrliF_ww_9E3ikPbn";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/* กิจการของหน้าบันทึกรายวัน: หน้าแรก = ร้านลาบ (LS) · ns/index.html ตั้ง window.LAAB_ENTITY = "NS" ก่อนโหลดสคริปต์ */
export const ENTITY = (typeof window !== "undefined" && window.LAAB_ENTITY === "NS") ? "NS" : "LS";
