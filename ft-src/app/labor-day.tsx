'use client';
import {useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {cents,type Expenses} from '@/lib/expenses';
import {laborDayPreview,type DayStatus} from '@/lib/labor-day';
const fmt=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:2});
const labels:Record<DayStatus,string>={unset:'ยังไม่ลงเวลา',full:'เต็มวัน',half:'ครึ่งวัน',off:'หยุด'};
type Draft={status?:DayStatus;amount?:string;note?:string;paymentId?:string};
type Props={state:Expenses;today:string;busy:boolean;submit:(action:string,values:Record<string,unknown>)=>Promise<boolean>};
export default function LaborDay({state,today,busy,submit}:Props){
 const [date,setDate]=useState(today),[drafts,setDrafts]=useState<Record<string,Draft>>({}),[saved,setSaved]=useState(false);
 const formRef=useRef<HTMLFormElement>(null);
 const dirty=Object.keys(drafts).length>0;
 useEffect(()=>{if(!dirty)return;const before=(ev:BeforeUnloadEvent)=>{ev.preventDefault();ev.returnValue=''};window.addEventListener('beforeunload',before);return()=>window.removeEventListener('beforeunload',before)},[dirty]);
 const employees=state.employees.filter(e=>e.startDate<=date);
 const statusFor=(id:string):DayStatus=>drafts[id]?.status??state.attendance.find(a=>a.employeeId===id&&a.date===date)?.status??'unset';
 function update(id:string,patch:Draft){setSaved(false);setDrafts(old=>({...old,[id]:{...old[id],...patch,paymentId:old[id]?.paymentId||crypto.randomUUID()}}));}
 const full=employees.filter(e=>statusFor(e.id)==='full').length,half=employees.filter(e=>statusFor(e.id)==='half').length,off=employees.filter(e=>statusFor(e.id)==='off').length;
 const paymentTotal=cents(Object.values(drafts).reduce((n,d)=>n+(Number(d.amount)||0),0));
 return <section className="labor-day"><div className="labor-day-heading"><label className="expense-date">วันที่ทำงานและจ่ายเงิน<input type="date" required value={date} disabled={busy||dirty} onChange={ev=>{if(ev.target.value){setDate(ev.target.value);setSaved(false)}}}/></label>
 <p className="expense-callout">มาทำงาน <b>{full+half}</b> คน · เต็มวัน {full} · ครึ่งวัน {half} · หยุด {off} · ยังไม่ลงเวลา {employees.length-full-half-off}</p>
</div><details className="labor-help"><summary>วิธีใช้</summary> <p className="muted">ใส่เงินเฉพาะที่จ่ายเพิ่มครั้งนี้ · ไม่รับเงินให้เว้นว่างหรือใส่ 0 ยอดจะอยู่ในเงินฝากคนงาน · ยอดเบิกเก่าจะหักก่อนคำนวณเงินที่รับได้</p>
 <p className="muted">รายเดือน: ลงเวลาเก็บเป็นประวัติ ตั้งเงินเดือนในหัวข้อด้านล่างก่อนจ่าย · คนที่หยุดหรือยังไม่ลงเวลาก็รับเงินสะสมหรือเบิกได้</p>
</details>
 <form ref={formRef} onReset={()=>{setDrafts({});setSaved(false)}} onSubmit={async ev=>{ev.preventDefault();const rows=Object.entries(drafts).filter(([,d])=>d.status!==undefined||Number(d.amount)>0).map(([employeeId,d])=>({employeeId,...(d.status!==undefined?{status:d.status}:{}),amount:Number(d.amount||0),note:d.note||'',paymentId:d.paymentId}));if(!rows.length){toast.error('เลือกสถานะทำงาน หรือใส่ยอดเงินที่จะจ่ายก่อนบันทึก');return}if(await submit('laborDay',{date,rows})){setDrafts({});setSaved(true)}}}>
 <fieldset disabled={busy}><div className="expense-table labor-day-scroll"><table><thead><tr><th>คนงาน / อัตรา</th><th>มาทำงาน</th><th>ค่าแรงวันนี้</th><th>จ่ายแล้ววันนี้</th><th>จ่ายเพิ่ม (บาท)</th><th>ยอดคงเหลือหลังบันทึก</th></tr></thead><tbody>{employees.map(e=>{
 const d=drafts[e.id]||{},status=statusFor(e.id),amount=Number(d.amount||0),p=laborDayPreview(state,e,date,status,Number.isFinite(amount)?amount:0);
 return <tr key={e.id}><td><b>{e.name}</b><small>{p.rate?`${fmt(p.rate.amount)} / ${p.rate.type==='daily'?'วัน':'เดือน'}`:'ยังไม่มีอัตรา'}{e.active?'':' · ปิดใช้งาน'}</small></td><td><select aria-label={'สถานะ '+e.name} value={status} onChange={ev=>update(e.id,{status:ev.target.value as DayStatus})}>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></td><td className="labor-number">{p.rate?.type==='monthly'?'ตามเงินเดือน':fmt(p.earned)}</td>
 <td className="labor-number"><b>{fmt(p.paidToday)}</b>{p.earned>0&&p.paidToday>=p.earned&&<small className="money-paid">จ่ายครบแล้ว</small>}</td>
 <td><div className="labor-payment-controls"><input aria-label={'จ่ายเพิ่ม '+e.name} type="number" min="0" max="1000000000" step="0.01" inputMode="decimal" placeholder="0" value={d.amount||''} onChange={ev=>update(e.id,{amount:ev.target.value})}/><button type="button" disabled={status==='unset'||p.todayDue<=0} onClick={()=>update(e.id,{amount:'0',status})}>ฝากทั้งหมด</button></div>
 <div className="labor-pay-options"><button type="button" disabled={p.todayDue<=0} onClick={()=>update(e.id,{amount:String(p.todayDue)})}>จ่ายเฉพาะวันนี้ {fmt(p.todayDue)}</button><button type="button" disabled={p.dueBefore<=0} onClick={()=>update(e.id,{amount:String(p.dueBefore)})}>จ่ายยอดค้างทั้งหมด {fmt(p.dueBefore)}</button></div>
 {p.depositToday>0&&<small className="money-paid">ฝากเพิ่มวันนี้ {fmt(p.depositToday)} บาท</small>}
 <details className="labor-payment-note"><summary>หมายเหตุ</summary><input aria-label={'หมายเหตุการจ่าย '+e.name} disabled={!(amount>0)} maxLength={2000} value={d.note||''} onChange={ev=>update(e.id,{note:ev.target.value})} placeholder="เช่น รับรวม 5 วัน"/></details></td>
 <td className="labor-balances">{p.due>0?<span className="money-paid">เงินฝากคนงาน <b>{fmt(p.due)}</b></span>:p.advance>0?<span className="red">คนงานเบิกเกินค่าแรง <b>{fmt(p.advance)}</b></span>:<span className="money-paid">ไม่มียอดค้าง</span>}{p.advance>0&&<small>ค่าแรงสะสมจะหักยอดนี้ก่อน</small>}</td></tr>;
 })}</tbody></table></div>
 {!employees.length&&<p>ยังไม่มีคนงานในวันที่เลือก เพิ่มได้ที่ “พนักงานและอัตรา”</p>}
 <div className="labor-day-actions"><strong>จ่ายเพิ่มรวม {fmt(paymentTotal)} บาท</strong><button className="save" type="submit" disabled={!dirty||!employees.length}>บันทึกทั้งหมด</button>{dirty&&<button type="reset">ยกเลิกการแก้ไข</button>}</div>
 {dirty&&<p className="muted">ยังไม่บันทึก · บันทึกหรือยกเลิกก่อนเปลี่ยนวันที่</p>}{saved&&<p role="status" className="money-paid">บันทึกลงเวลาและจ่ายเงินเรียบร้อยแล้ว</p>}
 </fieldset></form></section>;
}
