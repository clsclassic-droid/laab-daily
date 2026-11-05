// nightly-backup — สำรองข้อมูลระบบบัญชีเป็นชิ้น (ชิ้นละไม่เกิน 10,000 แถว ดึงทีละ 1,000 แถว)
// เรียกจากฐานข้อมูลเท่านั้น (public.backup_call) ต้องมี token ที่เก็บใน Vault
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BUCKET = "backups";
const PAGE = 1000;

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function gzip(text: string): Promise<Uint8Array> {
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function gunzip(buf: ArrayBuffer): Promise<string> {
  const s = new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(s).text();
}

type Job = {
  id: number; table_name: string; scope: string; part: number; start_row: number; row_limit: number;
  pk: string; select_expr: string; filters: [string, string, string][]; expected_total: number; path: string;
};

async function loadJob(id: number): Promise<Job> {
  const { data, error } = await sb.from("backup_jobs").select("*").eq("id", id).single();
  if (error || !data) throw new Error("ไม่พบงานสำรอง " + id + (error ? ": " + error.message : ""));
  return data as Job;
}

async function fetchRows(job: Job) {
  const rows: Record<string, unknown>[] = [];
  const end = job.start_row + job.row_limit;
  for (let from = job.start_row; from < end; from += PAGE) {
    const to = Math.min(from + PAGE, end) - 1;
    let q = sb.from(job.table_name).select(job.select_expr);
    for (const [col, op, val] of job.filters) q = q.filter(col, op, val);
    const { data, error } = await q.order(job.pk, { ascending: true }).range(from, to);
    if (error) throw new Error(`${job.table_name} แถว ${from}-${to}: ${error.message}`);
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      if (job.select_expr !== "*") for (const k of Object.keys(r)) if (r[k] !== null && typeof r[k] === "object" && !Array.isArray(r[k]) && Object.keys(r[k] as object).length === 0) delete r[k];
      rows.push(r);
    }
    if (!data || data.length < to - from + 1) break; // หมดตารางแล้ว
  }
  return rows;
}

async function doPart(jobId: number) {
  const job = await loadJob(jobId);
  try {
    const rows = await fetchRows(job);
    const text = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
    const gz = await gzip(text);
    const up = await sb.storage.from(BUCKET).upload(job.path, gz, { contentType: "application/gzip", upsert: true });
    if (up.error) throw new Error("อัปโหลด: " + up.error.message);
    // อ่านไฟล์กลับมานับแถวอีกครั้ง ยืนยันว่าไฟล์สมบูรณ์
    const dl = await sb.storage.from(BUCKET).download(job.path);
    if (dl.error || !dl.data) throw new Error("อ่านไฟล์กลับ: " + (dl.error?.message ?? "ว่าง"));
    const back = (await gunzip(await dl.data.arrayBuffer())).split("\n").filter((l) => l.length > 0).length;
    if (back !== rows.length) throw new Error(`ไฟล์ไม่ครบ: เขียน ${rows.length} อ่านกลับ ${back}`);
    await sb.from("backup_jobs").update({ status: "ok", rows: rows.length, bytes: gz.byteLength, error: null, finished_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: true, job: job.id, rows: rows.length, bytes: gz.byteLength };
  } catch (e) {
    const msg = String((e as Error)?.message ?? e).slice(0, 500);
    await sb.from("backup_jobs").update({ status: "error", error: msg, finished_at: new Date().toISOString() }).eq("id", job.id);
    return { ok: false, job: job.id, error: msg };
  }
}

// ทดสอบกู้คืน: อ่านไฟล์สำรอง แปลงกลับเป็นแถว แล้วให้ฐานข้อมูลเทียบกับของจริงทีละ 1,000 แถว (ไม่เขียนข้อมูล)
async function doVerify(jobId: number) {
  const job = await loadJob(jobId);
  const dl = await sb.storage.from(BUCKET).download(job.path);
  if (dl.error || !dl.data) throw new Error("อ่านไฟล์: " + (dl.error?.message ?? "ว่าง"));
  const lines = (await gunzip(await dl.data.arrayBuffer())).split("\n").filter((l) => l);
  let mismatch = 0;
  for (let i = 0; i < lines.length; i += PAGE) {
    const chunk = lines.slice(i, i + PAGE).map((l) => JSON.parse(l));
    const { data, error } = await sb.rpc("backup_restore_check", { p_table: job.table_name, p_pk: job.pk, p_rows: chunk });
    if (error) throw new Error(`เทียบ แถว ${i}-${i + chunk.length - 1}: ` + error.message);
    mismatch += Number(data) || 0;
  }
  await sb.from("backup_jobs").update({ verified_mismatch: mismatch }).eq("id", job.id);
  return { job: job.id, rows: lines.length, mismatch };
}

// ลบชุดสำรองที่เก่ากว่า keep_days วัน (โฟลเดอร์ชื่อ YYYY-MM-DD)
async function doCleanup(keepDays: number) {
  const keep = Math.max(7, Number(keepDays) || 30);
  const cutoff = new Date(Date.now() - keep * 86400000).toISOString().slice(0, 10);
  const { data: days, error } = await sb.storage.from(BUCKET).list("", { limit: 1000 });
  if (error) throw new Error(error.message);
  const removed: string[] = [];
  for (const d of days ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.name) || d.name >= cutoff) continue;
    for (const scope of ["live", "history"]) {
      const { data: files } = await sb.storage.from(BUCKET).list(`${d.name}/${scope}`, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${d.name}/${scope}/${f.name}`);
      if (paths.length) {
        const r = await sb.storage.from(BUCKET).remove(paths);
        if (r.error) throw new Error(r.error.message);
        removed.push(...paths);
      }
    }
  }
  return { removed: removed.length, cutoff };
}

Deno.serve(async (req) => {
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* ว่าง */ }
  const { data: ok } = await sb.rpc("backup_token_ok", { t: String(body.token ?? "") });
  if (ok !== true) return json({ error: "forbidden" }, 403);
  try {
    if (body.mode === "part") return json(await doPart(Number(body.job_id)));
    if (body.mode === "verify") return json(await doVerify(Number(body.job_id)));
    if (body.mode === "cleanup") return json(await doCleanup(Number(body.keep_days)));
    return json({ error: "mode" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
