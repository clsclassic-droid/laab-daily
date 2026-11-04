import {allProducts,productActive} from '@/lib/product-settings';
import {customerInactive} from '@/lib/customer-management';
import {cachedOverviewSQL,saveOverview} from '@/lib/overview-cache';
import {overview} from '@/lib/overview';
import {db} from '@/lib/db';
import {validDate} from '@/lib/calendar';
import seed from '@/lib/seed.json';
import {initialBusiness,dueDate,freeCustomer,canonical} from '@/lib/business';
import {captureMeta,captureRecords} from '@/lib/backup-sql';
import {missingExcelReceipts,correctExcelReceipts} from '@/lib/excel-receipts';
import {recordStatus,updateRecordStatus} from '@/lib/record-status';
export const dynamic='force-dynamic';
async function initialize(){const d=db();const done=await d.prepare('SELECT value FROM settings WHERE key=?').bind('import-v1').first();if(!done){for(let i=0;i<seed.records.length;i+=80){await d.prepare("INSERT OR IGNORE INTO records(id,kind,date,payload) SELECT json_extract(value,'$.id'),json_extract(value,'$.kind'),json_extract(value,'$.date'),json(value) FROM json_each(?)").bind(JSON.stringify(seed.records.slice(i,i+80))).run();}await d.batch([d.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind('opening',JSON.stringify(seed.opening)),d.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind('import-v1','done')]);}const corrected=await d.prepare('SELECT value FROM settings WHERE key=?').bind('excel-receipts-v1').first();if(!corrected){const ids=JSON.stringify(seed.records.filter(r=>r.kind==='sale').map(r=>r.id));const missing=await d.prepare(missingExcelReceipts).bind(ids).first();if(missing){const id=crypto.randomUUID();await d.batch([d.prepare(captureMeta).bind(id,new Date().toISOString(),'อัตโนมัติ ก่อนแก้วันที่รับเงินจาก Excel'),d.prepare(captureRecords).bind(id,id),d.prepare(correctExcelReceipts).bind(ids)]);}await d.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').bind('excel-receipts-v1','done').run();}}

// Log stage names and durations only, never record contents or customer names.
function requestTrace(operation:string){
 const id=crypto.randomUUID(),started=performance.now();
 const stages:Record<string,number>={};
 async function run<T>(stage:string,work:()=>Promise<T>):Promise<T>{
  const start=performance.now();console.info(JSON.stringify({event:'records-stage',id,operation,stage,state:'start'}));
  try{return await work();}finally{const ms=Math.round(performance.now()-start);stages[stage]=(stages[stage]||0)+ms;console.info(JSON.stringify({event:'records-stage',id,operation,stage,state:'end',ms}));}
 }
 function finish(){console.info(JSON.stringify({event:'records-timing',id,operation,totalMs:Math.round(performance.now()-started),stages}));}
 return {run,finish};
}
type RequestTrace=ReturnType<typeof requestTrace>;
function response(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export async function GET(req:Request){const started=performance.now(),trace=requestTrace('load');try{
 const url=new URL(req.url),month=url.searchParams.get('month'),previous=url.searchParams.get('previous');
 if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return response({error:'เดือนไม่ถูกต้อง'},400);
 if(previous!==null&&!validDate(url.searchParams.get('date')))return response({error:'วันที่ไม่ถูกต้อง'},400);
 const full=!month||url.searchParams.get('full')==='1',cacheKey=month&&!full&&previous===null?'overview-v4:'+month+':'+(url.searchParams.get('summaryFull')==='1'?'all':'month'):null;
 const d=db();
 const settingsSQL="SELECT key,value FROM settings WHERE key IN ('import-v1','excel-receipts-v1','opening','business-v1','overview-revision-v1')";
 const first=await trace.run('settings-cache-read',()=>d.batch<{key?:string;value?:string;payload?:string}>([d.prepare(settingsSQL),...(cacheKey?[d.prepare(cachedOverviewSQL).bind(cacheKey)]:[])]));
 const cached=first[1]?.results[0]?.payload;
 if(cached)return new Response(cached,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Server-Timing':`app;dur=${(performance.now()-started).toFixed(1)}`,'X-Overview-Cache':'hit'}});
 if(!first[0].results.some(r=>r.key==='import-v1')||!first[0].results.some(r=>r.key==='excel-receipts-v1'))await initialize();
 if(previous!==null){const setting=await d.prepare('SELECT value FROM settings WHERE key=?').bind('business-v1').first<{value:string}>(),business=setting?JSON.parse(setting.value):initialBusiness;
 const rawNames=await d.prepare("SELECT DISTINCT json_extract(payload,'$.customer') AS customer FROM records WHERE kind='sale'").all<{customer:string}>();const names=rawNames.results.map(r=>r.customer||'').filter(n=>canonical(n,business)===canonical(previous,business));
 const row=await d.prepare("SELECT payload FROM records WHERE kind='sale' AND date<=? AND id<>? AND json_extract(payload,'$.customer') IN (SELECT value FROM json_each(?)) AND COALESCE(json_extract(payload,'$.voided'),0)=0 AND EXISTS(SELECT 1 FROM json_each(json_extract(records.payload,'$.items')) WHERE json_extract(value,'$.quantity')>0) ORDER BY date DESC,COALESCE(json_extract(payload,'$.createdOrder'),0) DESC,id DESC LIMIT 1").bind(url.searchParams.get('date'),url.searchParams.get('exclude')||'',JSON.stringify(names)).first<{payload:string}>();return response({record:row?JSON.parse(row.payload):null});}
 // Read records and their settings/revision in one database transaction and round trip.
 const snapshot=await trace.run('records-read',()=>d.batch<{payload?:string;key?:string;value?:string}>([d.prepare(full||previous!==null?'SELECT payload FROM records ORDER BY date DESC,id DESC':`SELECT CASE WHEN COALESCE(json_extract(payload,'$.historyOnly'),0)=0 OR substr(date,1,7)=? THEN payload ELSE json_object('id',id,'kind',kind,'date',date,'customer',json_extract(payload,'$.customer'),'total',json_extract(payload,'$.total'),'paid',json_extract(payload,'$.paid'),'receiptDate',json_extract(payload,'$.receiptDate'),'voided',json_extract(payload,'$.voided'),'historyOnly',json('true'),'items',json(CASE WHEN EXISTS(SELECT 1 FROM json_each(json_extract(records.payload,'$.items')) WHERE json_extract(value,'$.quantity')>0) THEN '[{"product":"","quantity":1}]' ELSE '[]' END)) END AS payload FROM records ORDER BY date DESC,id DESC`).bind(...(full||previous!==null?[]:[month])),d.prepare(settingsSQL)]));
 const rows=snapshot[0],settings=snapshot[1].results;
 const openingSetting=settings.find(r=>r.key==='opening'),businessSetting=settings.find(r=>r.key==='business-v1');
 const revision=Number(settings.find(r=>r.key==='overview-revision-v1')?.value||0);
 const parsed=rows.results.map(r=>JSON.parse(r.payload!)),opening=JSON.parse(openingSetting?.value||'{}'),business=businessSetting?JSON.parse(businessSetting.value!):initialBusiness;
 const visible=full?parsed:parsed.filter(r=>r.date.startsWith(month!));
 const result={records:visible.filter(r=>!r.voided),cancelled:visible.filter(r=>r.voided),opening,products:allProducts(business),...(month?{business,overview:overview(parsed,opening,business,month,full||url.searchParams.get('summaryFull')==='1')}:{})};
 const payload=JSON.stringify(result);if(cacheKey){try{await trace.run('cache-write',()=>saveOverview(cacheKey,revision,payload));}catch(e){console.error('Overview cache write failed',e);}}
 return new Response(payload,{headers:{'Content-Type':'application/json','Cache-Control':'no-store','Server-Timing':`app;dur=${(performance.now()-started).toFixed(1)}`,'X-Overview-Cache':cacheKey?'miss':'none'}});
 }catch(e){console.error(e);return response({error:'โหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง'},503);}finally{trace.finish();}}

type SaveContext={setting:{value:string}|null;trace?:RequestTrace};
type PendingSave={statement:D1PreparedStatement;record:any};
async function saveContext():Promise<SaveContext>{
 const rows=await db().prepare("SELECT key,value FROM settings WHERE key IN ('import-v1','excel-receipts-v1','business-v1')").all<{key:string;value:string}>();
 if(!rows.results.some(r=>r.key==='import-v1')||!rows.results.some(r=>r.key==='excel-receipts-v1'))await initialize();
 return {setting:rows.results.find(r=>r.key==='business-v1')||null};
}
export async function POST(req:Request){
 const started=performance.now(),trace=requestTrace('save');
 try{
  if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return response({error:'ไม่อนุญาต'},403);
  const body:any=await trace.run('request-body',()=>req.json());
  if(body?.action!=='saveBatch'){
   const context=await trace.run('settings-read',()=>saveContext());context.trace=trace;
   const result=await trace.run('validate-and-save',()=>saveRecord(new Request(req.url,{method:'POST',body:JSON.stringify(body)}),context));
   result.headers.set('Server-Timing',`save;dur=${(performance.now()-started).toFixed(1)}`);return result;
  }
  if(!Array.isArray(body.records)||!body.records.length||body.records.length>40||body.records.some((r:any)=>!r||typeof r.id!=='string'||r.kind!=='sale'||r.action)||new Set(body.records.map((r:any)=>r.id)).size!==body.records.length)return response({error:'ชุดข้อมูลไม่ถูกต้อง ส่งได้ครั้งละไม่เกิน 40 รายการ'},400);
  const context=await trace.run('settings-read',()=>saveContext()),pending:PendingSave[]=[],results:any[]=[];
  for(const record of body.records){
   const result=await saveRecord(new Request(req.url,{method:'POST',body:JSON.stringify(record)}),context,pending);
   if(!result.ok){const error:any=await result.json();results.push({id:record.id,error:error.error});}
  }
  if(pending.length){
   try{
    const saved=await trace.run('batch-write',()=>db().batch(pending.map(p=>p.statement)));
    for(let i=0;i<pending.length;i++)results.push(saved[i].meta.changes?{id:pending[i].record.id,record:pending[i].record}:{id:pending[i].record.id,error:'ข้อมูลเปลี่ยนแล้วหรือรายการถูกยกเลิก กรุณาโหลดใหม่ก่อนบันทึก'});
   }catch(e){console.error(e);for(const p of pending)results.push({id:p.record.id,error:'ยังไม่ได้รับการยืนยันว่าบันทึกสำเร็จ กรุณาลองอีกครั้ง'});}
  }
  const result=response({results});result.headers.set('Server-Timing',`save;dur=${(performance.now()-started).toFixed(1)}`);return result;
 }catch(e){console.error(e);return response({error:'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้ง'},503);}finally{trace.finish();}
}
async function saveRecord(req:Request,context:SaveContext,pending?:PendingSave[]){try{if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return response({error:'ไม่อนุญาต'},403);const r:any=await req.json();if(!r||typeof r!=='object'||Array.isArray(r))return response({error:'ข้อมูลรายการไม่ถูกต้อง'},400);if(['cancelSale','restoreSale'].includes(r.action)){if(typeof r.id!=='string'||r.id.length>200||r.confirm!==r.id||String(r.reason||'').length>2000)return response({error:'กรุณายืนยันรายการขาย'},400);const row=await db().prepare('SELECT payload FROM records WHERE id=?').bind(r.id).first<{payload:string}>();if(!row)return response({error:'ไม่พบรายการขาย'},404);const old=JSON.parse(row.payload);if(old.kind!=='sale')return response({error:'ยกเลิกได้เฉพาะรายการขาย'},400);const target=r.action==='cancelSale';if(!!old.voided===target)return response({ok:true,record:old});if(!r.expected||JSON.stringify(old)!==JSON.stringify(r.expected))return response({error:'รายการนี้เปลี่ยนแล้ว กรุณาเปิดรายการใหม่ก่อนยืนยัน'},409);const next=recordStatus(old,r.action,String(r.reason||'').trim(),new Date().toISOString());const result=await db().prepare(updateRecordStatus).bind(JSON.stringify(next),r.id,row.payload).run();if(!result.meta.changes)return response({error:'ข้อมูลเปลี่ยนแล้ว กรุณาลองอีกครั้ง'},409);return response({ok:true,record:next});}if(r.voided)return response({error:'กรุณาใช้ปุ่มคืนรายการขาย'},400);if(typeof r.id!=='string'||!r.id||r.id.length>200||!['sale','production'].includes(r.kind)||!validDate(r.date)||!Array.isArray(r.items)||r.items.length<1||r.items.length>500)return response({error:'กรุณากรอกวันที่และสินค้า'},400);if(r.kind==='sale'&&(typeof r.customer!=='string'||!r.customer.trim()||r.customer.length>200))return response({error:'กรุณากรอกชื่อลูกค้า'},400);const productSetting=context.setting;const productBusiness=productSetting?JSON.parse(productSetting.value):initialBusiness;const productKeys=allProducts(productBusiness);const inactiveItems=r.items.filter((i:any)=>i&&!productActive(i.product,productBusiness));if(inactiveItems.length){const oldRow=await db().prepare('SELECT payload FROM records WHERE id=?').bind(r.id).first<{payload:string}>();const previousItems=oldRow?JSON.parse(oldRow.payload).items:[];if(inactiveItems.some((i:any)=>!previousItems.some((old:any)=>old.product===i.product)))return response({error:'สินค้านี้เลิกใช้งานแล้ว กรุณาเปิดใช้งานในหน้าตั้งค่าก่อนเพิ่มรายการใหม่'},400);}if(r.items.some((x:any)=>!x||typeof x!=='object'||!productKeys.includes(x.product)||!Number.isFinite(x.quantity)||!Number.isFinite(x.input??0))||!Number.isFinite(r.total)||!Number.isFinite(r.paid))return response({error:'จำนวนไม่ถูกต้อง'},400);if(r.unitPrices&&Object.values(r.unitPrices).some((v:any)=>!Number.isFinite(v)||v<0))return response({error:'ราคาสินค้าไม่ถูกต้อง'},400);if(r.dueDate&&!validDate(r.dueDate))return response({error:'วันนัดชำระไม่ถูกต้อง'},400);if(r.receiptDate&&!validDate(r.receiptDate))return response({error:'วันที่รับเงินไม่ถูกต้อง'},400);if(String(r.note||'').length>2000)return response({error:'หมายเหตุยาวเกินไป'},400);if(r.id.startsWith('history-')){const previous=await db().prepare('SELECT payload FROM records WHERE id=?').bind(r.id).first<{payload:string}>();if(!previous)return response({error:'ไม่พบข้อมูลย้อนหลัง'},404);r.historyOnly=JSON.parse(previous.payload).historyOnly===true;}if(r.kind==='sale'){const pricingBusiness=productBusiness;if(customerInactive(r.customer,pricingBusiness)){const existing=await db().prepare('SELECT payload FROM records WHERE id=?').bind(r.id).first<{payload:string}>();if(!existing||canonical(JSON.parse(existing.payload).customer||'',pricingBusiness)!==canonical(r.customer,pricingBusiness))return response({error:'ลูกค้านี้เลิกใช้งานแล้ว กรุณาเปิดใช้งานในหน้าลูกค้าก่อนบันทึกการขายใหม่'},400);}if(freeCustomer(r.customer,pricingBusiness)){r.total=0;r.unitPrices=Object.fromEntries(productKeys.map(p=>[p,0]));if(Object.hasOwn(r,'excelOutstanding'))r.excelOutstanding=0;}if(r.dueDateFixed!==true){r.dueDate=dueDate(r,productBusiness);}r.dueDateFixed=true;}const statement=db().prepare("INSERT INTO records(id,kind,date,payload) SELECT ?,?,?,? WHERE COALESCE((SELECT value FROM settings WHERE key='business-v1'),'')=? ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,date=excluded.date,payload=excluded.payload WHERE COALESCE(json_extract(records.payload,'$.voided'),0)=0").bind(r.id,r.kind,r.date,JSON.stringify(r),productSetting?.value||'');if(pending){pending.push({statement,record:r});return response({ok:true,record:r});}const saved=await (context.trace?context.trace.run('record-write',()=>statement.run()):statement.run());if(!saved.meta.changes)return response({error:'ข้อมูลเปลี่ยนแล้วหรือรายการถูกยกเลิก กรุณาโหลดใหม่ก่อนบันทึก'},409);return response({ok:true,record:r});}catch(e){console.error(e);return response({error:'บันทึกไม่สำเร็จ ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้ง'},503);}}
