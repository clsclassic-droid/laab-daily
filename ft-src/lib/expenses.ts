import {validDate} from './calendar';
export type Rate={date:string;type:'daily'|'monthly';amount:number};
export type Employee={id:string;name:string;startDate:string;openingBalance:number;active:boolean;rates:Rate[]};
export type Attendance={id:string;employeeId:string;date:string;status:'full'|'half'|'off';rate:number;type:'daily'|'monthly';earned:number};
export type Wage={id:string;employeeId:string;date:string;period:string;kind:'salary'|'bonus'|'overtime'|'deduction';amount:number;note:string;voided?:boolean};
export type LaborPayment={id:string;employeeId:string;date:string;amount:number;note:string;voided?:boolean};
export type Material={id:string;date:string;name:string;vendor:string;amount:number;note:string;voided?:boolean};
export type MaterialPayment={id:string;materialId:string;date:string;amount:number;note:string;voided?:boolean};
export type Expenses={version:number;employees:Employee[];attendance:Attendance[];wages:Wage[];laborPayments:LaborPayment[];materials:Material[];materialPayments:MaterialPayment[];operations:string[]};
export const emptyExpenses=():Expenses=>({version:0,employees:[],attendance:[],wages:[],laborPayments:[],materials:[],materialPayments:[],operations:[]});
const check=(ok:unknown,message:string)=>{if(!ok)throw Error(message)};
const text=(x:unknown,max=200)=>typeof x==='string'&&x.length<=max;
const id=(x:unknown)=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(x);
const money=(x:unknown)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=1e9&&Math.abs(x*100-Math.round(x*100))<.0001;
const date=(x:unknown)=>typeof x==='string'&&validDate(x);
export const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function rateAt(employee:Employee,day:string):Rate|undefined{return [...employee.rates].filter(r=>r.date<=day).sort((a,b)=>b.date.localeCompare(a.date))[0];}
export function employeeBalance(s:Expenses,employee:Employee,asOf:string){
 const inRange=(d:string)=>d>=employee.startDate&&d<=asOf;
 const earned=cents(s.attendance.filter(a=>a.employeeId===employee.id&&inRange(a.date)).reduce((n,a)=>n+a.earned,0)+s.wages.filter(w=>w.employeeId===employee.id&&!w.voided&&inRange(w.date)).reduce((n,w)=>n+w.amount,0));
 const paid=cents(s.laborPayments.filter(p=>p.employeeId===employee.id&&!p.voided&&inRange(p.date)).reduce((n,p)=>n+p.amount,0));
 const opening=employee.startDate<=asOf?employee.openingBalance:0;
 const balance=cents(opening+earned-paid);return {opening,earned,paid,balance,due:Math.max(0,balance),advance:Math.max(0,-balance)};
}
export function expenseTotals(s:Expenses,month:string){const raw=cents(s.materialPayments.filter(p=>!p.voided&&p.date.startsWith(month)).reduce((n,p)=>n+p.amount,0)),labor=cents(s.laborPayments.filter(p=>!p.voided&&p.date.startsWith(month)).reduce((n,p)=>n+p.amount,0));return {raw,labor,total:cents(raw+labor)};}
export function materialDue(s:Expenses,m:Material,asOf='9999-12-31'){return cents(m.amount-s.materialPayments.filter(p=>p.materialId===m.id&&!p.voided&&p.date<=asOf).reduce((n,p)=>n+p.amount,0));}
export function validateExpenses(s:any):asserts s is Expenses{
 check(s&&Number.isSafeInteger(s.version)&&s.version>=0,'ข้อมูลรายจ่ายไม่ถูกต้อง');
 for(const key of ['employees','attendance','wages','laborPayments','materials','materialPayments','operations'])check(Array.isArray(s[key])&&s[key].length<=50000,'ข้อมูลรายจ่ายมากเกินไปหรือไม่ถูกต้อง');
 const unique=(rows:any[])=>{const set=new Set();for(const r of rows){check(r&&id(r.id)&&!set.has(r.id),'รหัสรายการรายจ่ายซ้ำหรือไม่ถูกต้อง');set.add(r.id)}};
 for(const key of ['employees','attendance','wages','laborPayments','materials','materialPayments'])unique(s[key]);
 for(const e of s.employees){check(text(e.name)&&e.name.trim()&&date(e.startDate)&&money(e.openingBalance)&&typeof e.active==='boolean'&&Array.isArray(e.rates)&&e.rates.length>0,'ข้อมูลพนักงานไม่ถูกต้อง');const dates=new Set();for(const r of e.rates){check(date(r.date)&&!dates.has(r.date)&&['daily','monthly'].includes(r.type)&&money(r.amount)&&r.amount>=0,'อัตราค่าแรงไม่ถูกต้อง');dates.add(r.date)}check(!!rateAt(e,e.startDate),'ไม่มีอัตราค่าแรง ณ วันเริ่มต้น');}
 const employees=new Map<string,Employee>(s.employees.map((e:Employee)=>[e.id,e]));
 const linked=(r:any)=>{const e=employees.get(r.employeeId);check(e&&date(r.date)&&r.date>=e.startDate,'พนักงานหรือวันที่ไม่ถูกต้อง');};
 const days=new Set();for(const a of s.attendance){linked(a);const key=a.employeeId+'|'+a.date;check(!days.has(key)&&['full','half','off'].includes(a.status)&&['daily','monthly'].includes(a.type)&&money(a.rate)&&a.rate>=0&&money(a.earned)&&a.earned===cents(a.type==='daily'?a.rate*(a.status==='full'?1:a.status==='half'?.5:0):0),'ข้อมูลลงเวลาไม่ถูกต้อง');days.add(key);}
 const periods=new Set();for(const w of s.wages){linked(w);check(['salary','bonus','overtime','deduction'].includes(w.kind)&&money(w.amount)&&w.amount!==0&&text(w.note,2000)&&(w.voided===undefined||typeof w.voided==='boolean'),'รายการค่าแรงไม่ถูกต้อง');check(w.kind==='deduction'?w.amount<0:w.amount>0,'เครื่องหมายค่าแรงไม่ถูกต้อง');if(w.kind==='salary'){check(/^\d{4}-(0[1-9]|1[0-2])$/.test(w.period),'เดือนค่าแรงไม่ถูกต้อง');const key=w.employeeId+'|'+w.period;if(!w.voided){check(!periods.has(key),'ค่าแรงรายเดือนซ้ำ');periods.add(key);}}else check(w.note.trim(),'กรุณาระบุเหตุผลปรับค่าแรง');}
 for(const p of s.laborPayments){linked(p);check(money(p.amount)&&p.amount>0&&text(p.note,2000)&&(p.voided===undefined||typeof p.voided==='boolean'),'รายการจ่ายค่าแรงไม่ถูกต้อง');}
 const materials=new Map<string,Material>(s.materials.map((m:Material)=>[m.id,m]));for(const m of s.materials)check(date(m.date)&&text(m.name)&&m.name.trim()&&text(m.vendor)&&money(m.amount)&&m.amount>0&&text(m.note,2000)&&(m.voided===undefined||typeof m.voided==='boolean'),'รายการซื้อวัตถุดิบไม่ถูกต้อง');
 for(const p of s.materialPayments){const m=materials.get(p.materialId);check(m&&date(p.date)&&p.date>=m.date&&money(p.amount)&&p.amount>0&&text(p.note,2000)&&(p.voided===undefined||typeof p.voided==='boolean'),'รายการจ่ายวัตถุดิบไม่ถูกต้อง');if(!p.voided)check(!m!.voided,'รายการซื้อถูกยกเลิกแล้ว');}
 for(const m of s.materials)check(materialDue(s,m)>=0,'ยอดจ่ายวัตถุดิบเกินยอดซื้อ');check(s.operations.every(id),'รหัสคำขอไม่ถูกต้อง');
}
export function applyExpense(s:Expenses,input:any):Expenses{
 check(input&&id(input.operationId),'รหัสคำขอไม่ถูกต้อง');
 if(s.operations.includes(input.operationId))return s;
 const next:Expenses=JSON.parse(JSON.stringify(s));
 const employee=(eid:string)=>{const e=next.employees.find(e=>e.id===eid);check(e,'ไม่พบพนักงาน');return e!;};
 const newId=(rows:{id:string}[],rid:any)=>check(id(rid)&&!rows.some(r=>r.id===rid),'รหัสรายการซ้ำ กรุณาโหลดข้อมูลใหม่');
 const r=input.record;
 switch(input.action){
 case 'employee':{
  check(r,'ข้อมูลพนักงานไม่ครบ');newId(next.employees,r.id);check(!next.employees.some(e=>e.name.trim()===String(r.name).trim()),'มีชื่อพนักงานนี้แล้ว');
  next.employees.push({id:r.id,name:String(r.name||'').trim(),startDate:r.startDate,openingBalance:r.openingBalance,active:true,rates:[{date:r.startDate,type:r.type,amount:r.amount}]});break;
 }
 case 'employeeOpening':{
  const e=employee(input.employeeId);check(money(input.openingBalance),'ยอดตั้งต้นไม่ถูกต้อง');
  check(input.expectedOpeningBalance===e.openingBalance,'ยอดตั้งต้นเปลี่ยนแล้ว กรุณาโหลดข้อมูลล่าสุดและเปิดแก้ไขใหม่');
  e.openingBalance=input.openingBalance;break;
 }
 case 'employeeActive':{const e=employee(input.employeeId);check(typeof input.active==='boolean','สถานะไม่ถูกต้อง');e.active=input.active;break;}
 case 'rate':{
  const e=employee(input.employeeId);check(r&&date(r.date)&&r.date>=e.startDate,'วันที่เริ่มค่าแรงไม่ถูกต้อง');check(!e.rates.some(x=>x.date>=r.date),'อัตราใหม่ต้องเริ่มหลังอัตราที่ตั้งไว้ล่าสุด');
  check(!next.attendance.some(a=>a.employeeId===e.id&&a.date>=r.date)&&!next.wages.some(w=>w.employeeId===e.id&&!w.voided&&w.date>=r.date),'มีค่าแรงสะสมในช่วงนี้แล้ว เลือกวันที่ถัดไปหรือใช้รายการปรับค่าแรง');e.rates.push({date:r.date,type:r.type,amount:r.amount});break;
 }
 case 'attendance':
 case 'laborDay':{
  const combined=input.action==='laborDay';
  check(date(input.date)&&Array.isArray(input.rows)&&input.rows.length<=500&&(!combined||input.rows.length>0),'ข้อมูลลงเวลาไม่ถูกต้อง');const seen=new Set();
  for(const row of input.rows){const e=employee(row.employeeId);check(!seen.has(e.id),'รายชื่อซ้ำ');seen.add(e.id);check(input.date>=e.startDate,'ลงเวลาก่อนวันเริ่มต้นไม่ได้');
   if(!combined||row.status!==undefined){
    check(['unset','full','half','off'].includes(row.status),'สถานะลงเวลาไม่ถูกต้อง');
    const existing=next.attendance.find(a=>a.employeeId===e.id&&a.date===input.date);
    if(row.status==='unset')next.attendance=next.attendance.filter(a=>a!==existing);
    else{
     const rate=existing?{amount:existing.rate,type:existing.type}:rateAt(e,input.date);check(rate,'ไม่พบอัตราค่าแรง');
     const entry:Attendance={id:existing?.id||e.id+'_'+input.date,employeeId:e.id,date:input.date,status:row.status,rate:rate!.amount,type:rate!.type,earned:cents(rate!.type==='daily'?rate!.amount*(row.status==='full'?1:row.status==='half'?.5:0):0)};
     if(existing)Object.assign(existing,entry);else next.attendance.push(entry);
    }
   }
   if(combined){
    check(money(row.amount)&&row.amount>=0&&text(row.note,2000),'ยอดจ่ายหรือหมายเหตุไม่ถูกต้อง');
    check(row.status!==undefined||row.amount>0,'ไม่มีข้อมูลลงเวลาหรือจ่ายเงิน');
    if(row.amount>0){newId(next.laborPayments,row.paymentId);next.laborPayments.push({id:row.paymentId,employeeId:e.id,date:input.date,amount:row.amount,note:row.note.trim()});}
   }
  }break;
 }
 case 'wage':{
  check(r,'ข้อมูลค่าแรงไม่ครบ');employee(r.employeeId);newId(next.wages,r.id);
  if(r.kind==='salary'){const e=employee(r.employeeId),rate=rateAt(e,r.date);check(rate?.type==='monthly','วันที่นี้พนักงานไม่ได้ใช้อัตรารายเดือน');}
  next.wages.push({id:r.id,employeeId:r.employeeId,date:r.date,period:r.period||'',kind:r.kind,amount:r.amount,note:String(r.note||'').trim()});break;
 }
 case 'laborPayment':check(r,'ข้อมูลการจ่ายไม่ครบ');employee(r.employeeId);newId(next.laborPayments,r.id);next.laborPayments.push({id:r.id,employeeId:r.employeeId,date:r.date,amount:r.amount,note:String(r.note||'').trim()});break;
 case 'material':{
  check(r,'ข้อมูลซื้อไม่ครบ');newId(next.materials,r.id);next.materials.push({id:r.id,date:r.date,name:String(r.name||'').trim(),vendor:String(r.vendor||'').trim(),amount:r.amount,note:String(r.note||'').trim()});
  check(money(r.paid)&&r.paid>=0&&r.paid<=r.amount,'ยอดจ่ายต้องไม่เกินยอดซื้อ');if(r.paid>0)next.materialPayments.push({id:r.id,materialId:r.id,date:r.date,amount:r.paid,note:'จ่ายพร้อมซื้อ'});break;
 }
 case 'materialPayment':check(r,'ข้อมูลจ่ายไม่ครบ');newId(next.materialPayments,r.id);next.materialPayments.push({id:r.id,materialId:r.materialId,date:r.date,amount:r.amount,note:String(r.note||'').trim()});break;
 case 'void':{
  check(['wages','laborPayments','materials','materialPayments'].includes(input.collection)&&id(input.id),'รายการไม่ถูกต้อง');const list=next[input.collection as 'wages'],entry=list.find(x=>x.id===input.id);check(entry,'ไม่พบรายการ');check(typeof input.voided==='boolean','สถานะไม่ถูกต้อง');
  if(input.collection==='materials')check(!next.materialPayments.some(p=>p.materialId===input.id&&!p.voided),'ยกเลิกรายการจ่ายของใบซื้อนี้ก่อน');entry!.voided=input.voided;break;
 }
 default:throw Error('คำสั่งไม่ถูกต้อง');
 }
 next.version++;next.operations=[...next.operations,input.operationId].slice(-500);validateExpenses(next);return next;
}
