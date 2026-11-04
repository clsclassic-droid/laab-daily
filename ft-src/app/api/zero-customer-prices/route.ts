import {db} from '@/lib/db';
import seed from '@/lib/seed.json';
import {canonical,initialBusiness,type Business} from '@/lib/business';
import {captureMeta,captureRecords} from '@/lib/backup-sql';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'ไม่อนุญาต'},{status:403});
 const input:any=await req.json();if(input.action!=='zero-outlet-prices-keep-paid')return Response.json({error:'คำสั่งไม่ถูกต้อง'},{status:400});
 const d=db();const setting=await d.prepare('SELECT value FROM settings WHERE key=?').bind('business-v1').first<{value:string}>();const old=setting?.value||JSON.stringify(initialBusiness),b=JSON.parse(old) as Business;
 const targets=['ร้านก๋วยเตี๋ยวดาวเทียม','เสียบลูกชิ้นปิ้ง'].map(n=>canonical(n,b));
 const rows=await d.prepare("SELECT DISTINCT json_extract(payload,'$.customer') AS customer FROM records WHERE kind='sale'").all<{customer:string}>();
 const names=rows.results.filter(r=>targets.includes(canonical(r.customer,b))).map(r=>r.customer);
 for(const name of targets)b.customers[name]={...(b.customers[name]||{priceGroup:'retail',dueDays:null}),freeOfCharge:true};
 const snapshot='outlet-zero-prices-keep-paid-20261005';const exists=await d.prepare('SELECT id FROM backups WHERE id=?').bind(snapshot).first();const statements=[];
 if(!exists)statements.push(d.prepare(captureMeta).bind(snapshot,new Date().toISOString(),'ก่อนเปลี่ยนราคาดาวเทียมและเสียบลูกชิ้นปิ้งเป็น 0 · เก็บยอดจ่าย'),d.prepare(captureRecords).bind(snapshot,snapshot));
 const rates=JSON.stringify(Object.fromEntries(seed.products.map(p=>[p,0])));
 statements.push(d.prepare("UPDATE records SET payload=json_set(payload,'$.total',0,'$.unitPrices',json(?),'$.excelOutstanding',0) WHERE kind='sale' AND json_extract(payload,'$.customer') IN (SELECT value FROM json_each(?))").bind(rates,JSON.stringify(names)));
 if(setting)statements.push(d.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').bind(JSON.stringify(b),'business-v1',old));else statements.push(d.prepare('INSERT INTO settings(key,value) VALUES(?,?)').bind('business-v1',JSON.stringify(b)));
 const results=await d.batch(statements);if(!results.at(-1)?.meta.changes)return Response.json({error:'ข้อมูลตั้งค่ามีการเปลี่ยนแปลง กรุณาลองใหม่'},{status:409});
 return Response.json({ok:true,updated:results.at(-2)?.meta.changes,backup:snapshot});
 }catch(e){console.error(e);return Response.json({error:'แก้ราคาไม่สำเร็จ'},{status:503});}}
