import {draftRecord,type Draft,type Entry} from './record-draft';
import {customerPrices,freeCustomer,type Business} from './business';
export function prepareSaleDraft(draft:Draft,products:string[],business:Business){
 const f=draft.fields;
 const entry=draftRecord(draft,Array.from(new Set([...products,...Object.keys(f).filter(k=>k.startsWith('q:')).map(k=>k.slice(2))])),business);
 if(!freeCustomer(f.customer,business)&&entry.items.some(i=>!Number.isFinite(draft.record.unitPrices?.[i.product]??customerPrices(f.date,f.priceGroup,business,f.customer)[i.product])))throw Error('กรุณากรอกราคาสินค้าที่ยังไม่ได้ตั้งราคาก่อนบันทึก');
 return entry;
}
export type SaleSaveResult={id:string;record?:Entry;error?:string};
export async function saveSaleDrafts(drafts:Draft[],products:string[],business:Business,send:(entries:Entry[])=>Promise<SaleSaveResult[]>,onSuccess:(entry:Entry)=>void,onError:(id:string,message:string)=>void,onProgress:(done:number,total:number)=>void){
 let saved=0,done=0;
 const entries:Entry[]=[];
 for(const draft of drafts){
  try{entries.push(prepareSaleDraft(draft,products,business));}
  catch(error){onError(draft.record.id,error instanceof Error?error.message:'ข้อมูลไม่ถูกต้อง');onProgress(++done,drafts.length);}
 }
 // Bound each request; original IDs make retries update the same records.
 for(let offset=0;offset<entries.length;offset+=40){
  const chunk=entries.slice(offset,offset+40);
  let results:SaleSaveResult[];
  try{results=await send(chunk);}catch(error){results=chunk.map(entry=>({id:entry.id,error:error instanceof Error?error.message:'ยังไม่ได้รับการยืนยัน กรุณาลองอีกครั้ง'}));}
  for(const entry of chunk){
   const result=results.find(r=>r.id===entry.id);
   if(result?.record?.id===entry.id&&!result.error){onSuccess(result.record);saved++;}
   else onError(entry.id,result?.error||'ยังไม่ได้รับการยืนยันรายการ กรุณาลองอีกครั้ง');
   onProgress(++done,drafts.length);
  }
 }
 return {saved,total:drafts.length};
}
