import {db} from '@/lib/db';
import {emptyExpenses,validateExpenses,applyExpense} from '@/lib/expenses';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(){try{const row=await db().prepare("SELECT value FROM settings WHERE key='expenses-v1'").first<{value:string}>();const state=row?JSON.parse(row.value):emptyExpenses();validateExpenses(state);return reply(state);}catch{return reply({error:'โหลดรายจ่ายไม่ได้ กรุณาลองอีกครั้ง'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')&&req.headers.get('origin')!==new URL(req.url).origin)return reply({error:'ไม่อนุญาต'},403);
 const body=await req.text();if(body.length>150000)return reply({error:'คำขอใหญ่เกินไป'},413);let input:any;try{input=JSON.parse(body)}catch{return reply({error:'ข้อมูลอ่านไม่ได้'},400)}
 if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'ข้อมูลไม่ถูกต้อง'},400);
 const d=db(),row=await d.prepare("SELECT value FROM settings WHERE key='expenses-v1'").first<{value:string}>();const state=row?JSON.parse(row.value):emptyExpenses();validateExpenses(state);
 if(state.operations.includes(input.operationId))return reply(state);
 if(input.version!==state.version)return reply({error:'ข้อมูลเปลี่ยนจากอีกหน้าจอแล้ว กดโหลดข้อมูลล่าสุดก่อนลองบันทึกอีกครั้ง'},409);
 let next;try{next=applyExpense(state,input)}catch(e){return reply({error:(e as Error).message},400)}
 const result=await d.prepare("INSERT INTO settings(key,value) SELECT 'expenses-v1',? WHERE COALESCE((SELECT value FROM settings WHERE key='expenses-v1'),'')=? ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE settings.value=?").bind(JSON.stringify(next),row?.value||'',row?.value||'').run();
 if(!result.meta.changes)return reply({error:'ข้อมูลเปลี่ยนระหว่างบันทึก กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง'},409);return reply(next);
 }catch{return reply({error:'ยังไม่ยืนยันการบันทึก ข้อมูลที่กรอกยังอยู่ กรุณาลองอีกครั้ง'},503);}}
