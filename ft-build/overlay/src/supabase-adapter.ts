// ตัวต่อหน้าเว็บ FT (ทาง A ขั้นที่ 4) — 4 พ.ย. 2569
// โค้ดเว็บดาวเทียมเดิมเรียก fetch('/api/records' | '/api/business' | '/api/expenses') เหมือนเดิมทุกจุด
// ไฟล์นี้ดักคำขอเหล่านั้น แล้วไปเรียกฟังก์ชันในฐานข้อมูล Supabase (ft_api_* / ft_save_*) แทน
// → หน้าตาและการทำงานของเว็บเดิมไม่ต้องแก้ · สิทธิ์ข้อมูลคุมด้วย RLS ของผู้ล็อกอิน
// ทุกก้อนข้อมูลมี meta.counts จากฐานข้อมูล → นับเทียบกับจำนวนที่ได้รับจริง ถ้าไม่ตรง = แจ้ง error ไม่แสดงข้อมูลขาด
// RPC คืน JSON 1 แถว จึงไม่ติดเพดาน 1,000 แถวของ Supabase
// 4 พ.ย. (ข้อ B): โหลดเดือนเดิมซ้ำ → ดึงแค่ "ลายนิ้วมือรายบิล" (ft_api_records_index) แล้วดึงเฉพาะบิลที่เปลี่ยน (ft_api_records_pick)
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {overview} from '@/lib/overview';
import {allProducts} from '@/lib/product-settings';

const SUPABASE_URL='https://fzlkeqyqnvljcoujsiow.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_oNiAlvt0TZEaVdSrliF_ww_9E3ikPbn';
// storageKey เดียวกับร้านลาบ (ค่าเริ่มต้นของ supabase-js) → ล็อกอินครั้งเดียวใช้ได้ทั้งสองหน้า (โดเมนเดียวกัน)
export const supabase:SupabaseClient=createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});

// โหมดอ่านอย่างเดียว (ใช้ตอนทดสอบเทียบยอดกับข้อมูลจริง) · เปิดด้วย ?readonly=1 หรือค่าตอน build
const READ_ONLY=(typeof window!=='undefined'&&new URLSearchParams(location.search).get('readonly')==='1')||process.env.FT_READ_ONLY==='1';

type Json=any;
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
class ApiError extends Error{constructor(message:string,public status=400){super(message);}}

const isTimeout=(m:string)=>/statement timeout|canceling statement|timed out|57014/i.test(m);
async function rpc(fn:string,args:Record<string,unknown>={},attempt=1):Promise<Json>{
 const {data,error}=await supabase.rpc(fn,args);
 // ฐานข้อมูลเพิ่งตื่น/ช้าชั่วคราว → ลองใหม่เองสูงสุด 2 ครั้ง (เฉพาะตัวอ่าน ft_api_* ปลอดภัย ไม่บันทึกซ้ำ)
 if(error&&fn.startsWith('ft_api_')&&attempt<3&&isTimeout(error.message||'')){await new Promise(r=>setTimeout(r,800*attempt));return rpc(fn,args,attempt+1);}
 if(error){
  const msg=error.message||'ทำรายการไม่สำเร็จ';
  if(/JWT|not authenticated|permission denied|เข้าสู่ระบบ/i.test(msg))throw new ApiError('กรุณาเข้าสู่ระบบใหม่',401);
  // ข้อความภาษาไทยจากฐานข้อมูล = ข้อความที่เว็บเดิมใช้ · hint 409 = ข้อมูลชนกันจากอีกหน้าจอ
  if(isTimeout(msg))throw new ApiError('ฐานข้อมูลตอบช้า กรุณากดลองอีกครั้ง',503);
  throw new ApiError(msg,error.hint==='409'||/เปลี่ยนแล้ว|เปลี่ยนจากอีกหน้าจอ/.test(msg)?409:400);
 }
 return data;
}

// ---------- นับเทียบ (ห้ามแสดงข้อมูลขาดโดยไม่รู้ตัว) ----------
function checkCounts(label:string,expected:Record<string,number>,got:Record<string,number>){
 for(const [k,v] of Object.entries(got)){if(expected[k]!==undefined&&Number(expected[k])!==v)throw new ApiError(`โหลด${label}ไม่ครบ (${k}: ได้ ${v} จาก ${expected[k]}) กรุณาโหลดใหม่`,503);}
}
const countKinds=(list:Json[])=>({sales:list.filter(r=>r.kind==='sale').length,production_records:list.filter(r=>r.kind==='production').length,adjust_records:list.filter(r=>r.kind==='adjust').length});
function verifyRecords(d:Json){const all=[...d.records,...d.cancelled];checkCounts('ข้อมูลขาย/ผลิต',d.meta?.counts||{},countKinds(all));return d;}
function verifyBusiness(b:Json){const c=b.meta?.counts||{};checkCounts('ข้อมูลลูกค้า/ราคา',c,{customers:Object.keys(b.customers).length+Object.keys(b.aliases).length,products:Object.keys(b.productInfo).length,later_payments:b.payments.length,stock_count_rows:b.stockCounts.reduce((n:number,s:Json)=>n+s.items.length,0)});return b;}
function verifyExpenses(e:Json){const c=e.meta?.counts||{};checkCounts('รายจ่าย',c,{employees:e.employees.length,attendance:e.attendance.length,wages:e.wages.length,laborPayments:e.laborPayments.length,materials:e.materials.length,materialPayments:e.materialPayments.length});return e;}
const strip=(x:Json)=>{if(x&&typeof x==='object'){const {meta,...rest}=x;return rest;}return x;};

// ---------- ประวัติปี 2562–2568: เก็บสำเนาไว้ในเครื่อง (IndexedDB) ----------
// โหลดแบบครบทุกช่องครั้งเดียวต่อเครื่อง · ทุกครั้งที่เปิดเช็ก "ลายนิ้วมือ" รายปีจาก ft_api_history_meta()
// ตรงกัน = ใช้สำเนา · ไม่ตรง (มีคนแก้บิลเก่า/เปลี่ยนชื่อลูกค้า) = ดึงใหม่เฉพาะปีนั้น
// เก็บไม่ได้ (โหมดส่วนตัว/พื้นที่เต็ม) = ดึงจาก Supabase ตามปกติ ข้อมูลไม่หาย
const IDB_NAME='ft-history-cache',IDB_STORE='years';
function idb():Promise<IDBDatabase|null>{
 return new Promise(resolve=>{try{const req=indexedDB.open(IDB_NAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(IDB_STORE);req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);req.onblocked=()=>resolve(null);}catch{resolve(null);}});
}
async function idbGet(key:string):Promise<Json|undefined>{
 const db=await idb();if(!db)return undefined;
 return new Promise(resolve=>{try{const r=db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(undefined);}catch{resolve(undefined);}});
}
async function idbPut(key:string,value:Json){
 const db=await idb();if(!db)return;
 await new Promise<void>(resolve=>{try{const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>resolve();tx.onabort=()=>resolve();}catch{resolve();}});
}
let metaPromise:Promise<Record<string,string>>|null=null;
const historyMeta=()=>{if(!metaPromise){metaPromise=rpc('ft_api_history_meta');metaPromise.catch(()=>{metaPromise=null;});}return metaPromise;};
const historyCache=new Map<number,Promise<Json[]>>();
function historyYear(year:number):Promise<Json[]>{
 let p=historyCache.get(year);
 if(!p){p=(async()=>{
  const meta=await historyMeta(),fp=meta[String(year)],key='v1:'+year;
  const saved=await idbGet(key);
  if(fp&&saved?.fp===fp&&Array.isArray(saved.records))return saved.records as Json[];
  const h=await rpc('ft_api_history',{p_year:year,p_full:true});
  const all=[...h.records,...h.cancelled];
  checkCounts('ประวัติปี '+year,h.meta?.counts||{},{sales:all.filter((r:Json)=>r.kind==='sale').length,production_records:all.filter((r:Json)=>r.kind==='production').length});
  if(fp)await idbPut(key,{fp,records:all,savedAt:new Date().toISOString()});
  return all;
 })();p.catch(()=>historyCache.delete(year));historyCache.set(year,p);}
 return p;
}
async function allHistory(years:number[],_full:boolean,exceptMonth?:string){
 // ดึงทีละปี (ไม่ยิงพร้อมกัน) → ฐานข้อมูลขนาดเล็กไม่หนักจนเกินเวลา 8 วินาที
 const parts:Json[][]=[];for(const y of years)parts.push(await historyYear(y));
 // เดือนที่เลือกได้แบบเต็มจาก ft_api_records แล้ว → ตัดซ้ำ
 return parts.flat().filter(r=>!exceptMonth||!r.date.startsWith(exceptMonth));
}
// บันทึกบิลย้อนหลัง → ล้างความจำในหน้านี้ ให้เช็กลายนิ้วมือใหม่ตอนโหลดครั้งถัดไป
function invalidateHistory(){metaPromise=null;historyCache.clear();}

// ---------- ข้อ B: ข้อมูลเดือนที่เลือก ดึงเฉพาะบิลที่เปลี่ยน ----------
// ครั้งแรกของเดือน: index (ลายนิ้วมือทุกบิล) → pick ทุกบิล (ทีละ 2,000) · business ดึงเมื่อลายนิ้วมือเปลี่ยน
// ครั้งต่อไป (เช่นหลังกดบันทึก): index อย่างเดียว (~160 KB) → pick เฉพาะบิลที่ใหม่/เปลี่ยน · ลบบิลที่หายไป
// ใช้ลายนิ้วมือจาก index ที่ได้ "ก่อน" pick เสมอ → ถ้าบิลเปลี่ยนระหว่างทาง รอบหน้าจะดึงซ้ำเอง (ไม่ค้างของเก่า)
// นับเทียบ meta.counts หลังรวมทุกครั้ง · ไม่ตรง/ขาด = ล้างแล้วดึงเต็มด้วย ft_api_records
type MonthCache={hash:Map<string,string>;rows:Map<string,Json>;business?:Json;businessFp?:string};
const monthCache=new Map<string,MonthCache>();
const PICK_LIMIT=2000;
async function monthFull(month:string|null){
 const d=verifyRecords(await rpc('ft_api_records',{p_month:month}));
 return {records:d.records as Json[],cancelled:d.cancelled as Json[],opening:d.opening,products:d.products,business:strip(d.business),meta:d.meta};
}
async function monthDelta(month:string){
 const key=month;let c=monthCache.get(key);
 try{
  const ix=await rpc('ft_api_records_index',{p_month:month});
  const idx:Record<string,string>=ix.idx||{};
  if(!c)c={hash:new Map(),rows:new Map()};
  const need=Object.keys(idx).filter(id=>c!.hash.get(id)!==idx[id]||!c!.rows.has(id));
  for(let i=0;i<need.length;i+=PICK_LIMIT){
   const p=await rpc('ft_api_records_pick',{p_month:month,p_ids:need.slice(i,i+PICK_LIMIT)});
   for(const r of [...p.records,...p.cancelled])c.rows.set(String(r.id),r);
  }
  for(const id of need)c.hash.set(id,idx[id]);
  for(const id of [...c.rows.keys()])if(!Object.hasOwn(idx,id)){c.rows.delete(id);c.hash.delete(id);}
  if(c.businessFp!==ix.business_fp||!c.business){c.business=strip(verifyBusiness(await rpc('ft_api_business')));c.businessFp=ix.business_fp;}
  const list=[...c.rows.values()];
  if(list.length!==Object.keys(idx).length)throw new ApiError('จำนวนบิลไม่ตรง',503);
  checkCounts('ข้อมูลขาย/ผลิต',ix.meta?.counts||{},countKinds(list));
  monthCache.set(key,c);
  return {records:list.filter(r=>!r.voided),cancelled:list.filter(r=>r.voided),opening:ix.opening,products:ix.products,business:c.business,meta:ix.meta};
 }catch(e){
  // อะไรผิดปกติ → ทิ้งสำเนาเดือนนี้ แล้วดึงเต็มแบบเดิม (ตรวจนับเหมือนเดิม)
  monthCache.delete(key);
  if((e as ApiError).status===401)throw e;
  return monthFull(month);
 }
}
const byDateDesc=(a:Json,b:Json)=>b.date.localeCompare(a.date)||String(b.id).localeCompare(String(a.id));

// ---------- GET /api/records ----------
async function getRecords(url:URL){
 const month=url.searchParams.get('month'),previous=url.searchParams.get('previous');
 if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new ApiError('เดือนไม่ถูกต้อง');
 if(previous!==null){
  const date=url.searchParams.get('date');if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new ApiError('วันที่ไม่ถูกต้อง');
  return rpc('ft_api_previous',{p_customer:previous,p_date:date,p_exclude:url.searchParams.get('exclude')||''});
 }
 const full=!month||url.searchParams.get('full')==='1';
 const d=month?await monthDelta(month):await monthFull(null);
 const years:number[]=d.meta?.counts?.history_years||[];
 const history=await allHistory(years,full,month||undefined);
 const all=[...d.records,...d.cancelled,...history];
 const parsed=all.sort(byDateDesc);
 const visible=full?parsed:parsed.filter(r=>r.date.startsWith(month!));
 const business=d.business;
 return {records:visible.filter(r=>!r.voided),cancelled:visible.filter(r=>r.voided),opening:d.opening,products:allProducts(business),
  ...(month?{business,overview:overview(parsed,d.opening,business,month,full||url.searchParams.get('summaryFull')==='1')}:{})};
}

// ---------- POST /api/records ----------
async function postRecords(body:Json){
 if(body?.action==='saveBatch'){
  if(!Array.isArray(body.records)||!body.records.length||body.records.length>40)throw new ApiError('ชุดข้อมูลไม่ถูกต้อง ส่งได้ครั้งละไม่เกิน 40 รายการ');
  return rpc('ft_save_records',{p:body});
 }
 const res=await rpc('ft_save_record',{r:body});
 if(String(body?.id||'').startsWith('history-'))invalidateHistory();
 if(['cancelSale','restoreSale'].includes(body?.action)){
  // เว็บเดิมคืน record หลังเปลี่ยนสถานะ → สร้างจากรายการที่หน้าเว็บส่งมา
  const now=new Date().toISOString(),old=body.expected||{};
  const record=body.action==='cancelSale'?{...old,voided:true,cancelledAt:now,cancelReason:String(body.reason||'').trim()||undefined}:{...old,voided:undefined,restoredAt:now};
  return {ok:true,record};
 }
 return res;
}

// ---------- /api/business ----------
async function getBusiness(url:URL){
 const product=url.searchParams.get('checkProduct');
 const b=verifyBusiness(await rpc('ft_api_business'));
 if(product===null)return strip(b);
 if(!Object.hasOwn(b.productInfo,product))throw new ApiError('ไม่พบสินค้า',404);
 const {data:p,error}=await supabase.from('ft_products').select('id').eq('legacy_key',product).single();if(error)throw new ApiError('ตรวจสอบสินค้าไม่ได้',503);
 const used=await Promise.all(['ft_sale_items','ft_production','ft_stock_moves','ft_stock_counts'].map(t=>supabase.from(t).select('product_id',{count:'exact',head:true}).eq('product_id',p.id)));
 if(used.some(u=>u.error))throw new ApiError('ตรวจสอบสินค้าไม่ได้',503);
 return {canDelete:used.every(u=>(u.count||0)===0)};
}
const postBusiness=async(body:Json)=>{const b=strip(verifyBusiness(await rpc('ft_save_business',{p:body})));if(/^(customer|merge|product)/.test(String(body?.action)))invalidateHistory();return b;};

// ---------- /api/expenses ----------
const getExpenses=async()=>strip(verifyExpenses(await rpc('ft_api_expenses')));
const postExpenses=async(body:Json)=>strip(verifyExpenses(await rpc('ft_save_expense',{p:body})));

// ---------- ตัวดัก fetch ----------
const routes:Record<string,{GET?:(u:URL)=>Promise<unknown>;POST?:(b:Json)=>Promise<unknown>}>={
 '/api/records':{GET:getRecords,POST:postRecords},
 '/api/business':{GET:getBusiness,POST:postBusiness},
 '/api/expenses':{GET:getExpenses,POST:postExpenses},
};
export function installAdapter(){
 if(typeof window==='undefined'||(window as Json).__ftAdapter)return;(window as Json).__ftAdapter=true;
 const realFetch=window.fetch.bind(window);
 window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,location.href);
  const path=url.pathname.replace(/^.*?(\/api\/)/,'/api/');
  const route=url.origin===location.origin?routes[path]:undefined;
  if(!route){if(url.origin===location.origin&&path.startsWith('/api/'))return reply({error:'ส่วนนี้ไม่มีในระบบใหม่'},404);return realFetch(input as RequestInfo,init);}
  const method=(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
  try{
   if(init?.signal?.aborted)throw new DOMException('Aborted','AbortError');
   if(method==='GET'&&route.GET)return reply(await route.GET(url));
   if(method==='POST'&&route.POST){
    if(READ_ONLY)return reply({error:'โหมดทดสอบอ่านอย่างเดียว · ยังไม่บันทึกลงระบบจริง'},403);
    const text=typeof init?.body==='string'?init.body:input instanceof Request?await input.text():'';
    let body:Json;try{body=JSON.parse(text||'null');}catch{return reply({error:'ข้อมูลอ่านไม่ได้'},400);}
    return reply(await route.POST(body));
   }
   return reply({error:'คำสั่งไม่ถูกต้อง'},405);
  }catch(e){
   if((e as Error).name==='AbortError')throw e;
   const err=e as ApiError;return reply({error:err.message||'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง'},err.status||503);
  }
 };
}
export const isReadOnly=()=>READ_ONLY;
