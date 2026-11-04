'use client';
import {useState} from 'react';
import {Plus,Pencil,UserRoundX,UserRoundCheck} from 'lucide-react';
import {customerInactive} from '@/lib/customer-management';
import type {Business} from '@/lib/business';
type Props={selected?:string;business:Business;busy:boolean;mutate:(input:unknown)=>Promise<boolean>;onSaved:(name:string)=>void};
export default function CustomerManagement({selected,business,busy,mutate,onSaved}:Props){
 const [mode,setMode]=useState<'add'|'rename'|'status'|null>(null),[name,setName]=useState(''),[group,setGroup]=useState('retail'),[days,setDays]=useState('');
 const inactive=!!selected&&customerInactive(selected,business);
 const start=(next:typeof mode)=>{setMode(next);setName(next==='rename'?selected||'':'');setGroup('retail');setDays('');};
 async function save(e:React.FormEvent){e.preventDefault();if(busy||!mode)return;
  const input=mode==='add'?{action:'customerCreate',name:name.trim(),rule:{priceGroup:group,dueDays:days===''?null:Number(days)}}:mode==='rename'?{action:'customerRename',name:selected,newName:name.trim()}:{action:'customerStatus',name:selected,inactive:!inactive};
  if(await mutate(input)){setMode(null);onSaved(mode==='status'?selected!:name.trim());}
 }
 return <div className="customer-management"><div className="customer-management-actions">
 {selected?<><button type="button" disabled={busy} onClick={()=>start('rename')}><Pencil size={16}/>แก้ชื่อ</button><button type="button" disabled={busy} onClick={()=>start('status')}>{inactive?<UserRoundCheck size={16}/>:<UserRoundX size={16}/>} {inactive?'เปิดใช้งานอีกครั้ง':'เลิกใช้งาน'}</button>{inactive&&<span className="customer-inactive">เลิกใช้งานแล้ว</span>}</>:<button type="button" className="save" disabled={busy} onClick={()=>start('add')}><Plus size={18}/>เพิ่มลูกค้า</button>}
 </div>{mode&&<form className="customer-management-form" onSubmit={save}><h3>{mode==='add'?'เพิ่มลูกค้า':mode==='rename'?'แก้ชื่อลูกค้า':inactive?'เปิดใช้งานลูกค้าอีกครั้ง':'เลิกใช้งานลูกค้า'}</h3>
 {mode==='status'?<p>{selected} · {inactive?'ชื่อนี้จะกลับมาให้เลือกเมื่อบันทึกการขาย':'ซ่อนจากรายชื่อสำหรับขายใหม่ ยังดูประวัติและรับชำระหนี้ได้'}</p>:<label>ชื่อลูกค้า<input required maxLength={200} autoFocus value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}
 {mode==='rename'&&<p className="muted">ประวัติ ยอดค้าง และเงื่อนไขราคาเดิมจะอยู่ภายใต้ชื่อใหม่</p>}
 {mode==='add'&&<div className="twocol"><label>ราคาประจำ<select value={group} disabled={busy} onChange={e=>setGroup(e.target.value)}><option value="retail">ปลีก</option><option value="wholesale">ส่ง</option></select></label><label>นัดจ่ายหลังขาย (วัน)<input type="number" min="0" max="3650" step="1" placeholder="ไม่นัดจ่าย" value={days} disabled={busy} onChange={e=>setDays(e.target.value)}/></label></div>}
 <div className="customer-management-actions"><button className="save" disabled={busy||mode!=='status'&&!name.trim()} type="submit">{mode==='status'?(inactive?'ยืนยันเปิดใช้งาน':'ยืนยันเลิกใช้งาน'):'บันทึก'}</button><button type="button" disabled={busy} onClick={()=>setMode(null)}>ยกเลิก</button></div>
 </form>}</div>;
}
