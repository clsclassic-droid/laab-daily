import {db} from '@/lib/db';
import {validateBackup} from '@/lib/backup-file';
import {captureMeta,captureRecords} from '@/lib/backup-sql';
export const dynamic='force-dynamic';
const reply=(x:unknown,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'ไม่อนุญาต'},403);
 const body=await req.text();if(new TextEncoder().encode(body).length>8*1024*1024)return reply({error:'แบ่งนำเข้าไม่เกิน 8 MB ต่อครั้ง'},413);
 const input=JSON.parse(body);if(input.action!=='append-excel-history'||!Array.isArray(input.records)||input.records.length>10000)return reply({error:'ข้อมูลนำเข้าไม่ถูกต้อง'},400);
 const records=input.records;
 if(records.some((r:any)=>!r.id?.match(/^history-20\d\d-(sale|prod)-/)||r.historyOnly!==true||r.date<'2019-01-01'||r.date>='2026-01-01'))return reply({error:'รองรับเฉพาะประวัติจาก Excel ก่อนปี 2026'},400);
 validateBackup({format:'daothiam-backup',version:1,settings:{opening:'{}','import-v1':'done'},records});
 const d=db();const snapshot='excel-history-before-20261005';const exists=await d.prepare('SELECT id FROM backups WHERE id=?').bind(snapshot).first();
 if(!exists)await d.batch([d.prepare(captureMeta).bind(snapshot,new Date().toISOString(),'ก่อนเพิ่มข้อมูลย้อนหลัง Excel 2019–2025'),d.prepare(captureRecords).bind(snapshot,snapshot)]);
 const statements=[];for(let i=0;i<records.length;i+=100)statements.push(d.prepare("INSERT OR IGNORE INTO records(id,kind,date,payload) SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),json_extract(value,'$.date'),value FROM json_each(?)").bind(JSON.stringify(records.slice(i,i+100))));
 const results=statements.length?await d.batch(statements):[];
 return reply({ok:true,added:results.reduce((n,r)=>n+(r.meta.changes||0),0),submitted:records.length});
 }catch(e){console.error(e);return reply({error:'นำเข้าประวัติไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่'},400);}}
