'use client';
// ช่อง "ได้กี่ไม้" ของบิลเสียบลูกชิ้นปิ้ง (ลูกชิ้นปิ้ง ขั้นที่ 4 — 11 พ.ย. 2569)
// เก็บเป็นการย้ายของ (inv_moves: ผลิต → โรงงาน) ผูกกับบิลนี้ → เป็นสต๊อกไม้ปิ้งที่โรงงาน ที่ซัน/เกดเบิกไป
// บิลถูกยกเลิก → หน้าลูกชิ้นปิ้งไม่นับยอดไม้ของบิลนั้นเอง
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {supabase,isReadOnly} from '@/src/supabase-adapter';

type Item={product:string;quantity:number};
type Stick={id:string;name:string;meat:'เนื้อ'|'หมู'};
const fmt=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:2});
const isUuid=(s:string)=>/^[0-9a-f-]{36}$/i.test(s);

export default function StickYield({recordId,date,items,disabled}:{recordId:string;date:string;items:Item[];disabled?:boolean}){
 const [saleId,setSaleId]=useState<string|null>(null),[sticks,setSticks]=useState<Stick[]>([]);
 const [saved,setSaved]=useState<Record<string,number>>({}),[draft,setDraft]=useState<Record<string,string>>({});
 const [err,setErr]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const kg=(meat:string)=>items.filter(i=>i.product.startsWith(meat)).reduce((n,i)=>n+Number(i.quantity||0),0);
 async function load(){
  setErr('');
  const q=supabase.from('ft_sales').select('id');
  const {data:sale,error:e1}=await (isUuid(recordId)?q.or(`legacy_id.eq.${recordId},id.eq.${recordId}`):q.eq('legacy_id',recordId)).maybeSingle();
  if(e1)throw e1;if(!sale)throw Error('ยังไม่พบบิลนี้ในระบบ ลองโหลดหน้าใหม่');
  const {data:its,error:e2}=await supabase.from('inv_items').select('id,name').eq('unit','ไม้').eq('is_produced',true).eq('is_active',true).order('sort_order');
  if(e2)throw e2;
  const list:Stick[]=(its||[]).map(i=>({id:i.id,name:i.name,meat:i.name.includes('หมู')?'หมู':'เนื้อ'}));
  const {data:mv,error:e3}=await supabase.from('inv_moves').select('item_id,qty').eq('ft_sale_id',sale.id).eq('kind','produce');
  if(e3)throw e3;
  const s:Record<string,number>={};for(const m of mv||[])s[m.item_id]=(s[m.item_id]||0)+Number(m.qty);
  setSaleId(sale.id);setSticks(list);setSaved(s);setDraft(Object.fromEntries(list.map(x=>[x.id,s[x.id]?String(s[x.id]):''])));setLoaded(true);
 }
 useEffect(()=>{load().catch(e=>setErr((e as Error).message));},[recordId]);
 const shown=sticks.filter(s=>kg(s.meat)>0||saved[s.id]);
 const dirty=shown.some(s=>Number(draft[s.id]||0)!==(saved[s.id]||0));
 async function save(){
  if(!saleId||busy)return;
  const rows=shown.map(s=>({s,n:Number(draft[s.id]||0)}));
  if(rows.some(r=>!Number.isFinite(r.n)||r.n<0))return toast.error('จำนวนไม้ต้องเป็นตัวเลขไม่ติดลบ');
  setBusy(true);
  try{
   const {error:d}=await supabase.from('inv_moves').delete().eq('ft_sale_id',saleId).eq('kind','produce');if(d)throw d;
   const ins=rows.filter(r=>r.n>0).map(r=>({move_date:date,kind:'produce',item_id:r.s.id,qty:r.n,to_loc:'factory',source:'ft-skewer',ft_sale_id:saleId,note:'เสียบลูกชิ้นปิ้ง '+fmt(kg(r.s.meat))+' กก.'}));
   if(ins.length){const {error:i}=await supabase.from('inv_moves').insert(ins);if(i)throw i;}
   toast.success('บันทึกจำนวนไม้แล้ว');await load();
  }catch(e){toast.error('บันทึกไม่ได้: '+(e as Error).message);}finally{setBusy(false);}
 }
 if(err)return <div className="stick-yield"><p className="red">ช่องได้กี่ไม้: {err}</p></div>;
 if(!loaded)return <div className="stick-yield"><p className="muted">กำลังโหลดจำนวนไม้…</p></div>;
 if(!shown.length)return null;
 const locked=disabled||busy||isReadOnly();
 return <div className="stick-yield"><strong>ได้กี่ไม้</strong>
  {shown.map(s=>{const k=kg(s.meat),n=Number(draft[s.id]||0);return <label key={s.id}><span>{s.name} <small className="muted">({fmt(k)} กก.)</small></span>
   <input inputMode="numeric" value={draft[s.id]??''} disabled={locked} placeholder="ไม้" onChange={e=>setDraft({...draft,[s.id]:e.target.value.replace(/[^0-9.]/g,'')})}/>
   <small className="muted">{n>0&&k>0?fmt(Math.round(n/k*10)/10)+' ไม้/กก.':''}</small></label>;})}
  {dirty&&<button type="button" className="stick-save" disabled={locked} onClick={save}>{busy?'กำลังบันทึก…':'บันทึกจำนวนไม้'}</button>}
  <small className="muted">เข้าสต๊อกไม้ปิ้งที่โรงงาน ให้ซัน/เกดเบิกในหน้าลูกชิ้นปิ้ง</small>
 </div>;
}
