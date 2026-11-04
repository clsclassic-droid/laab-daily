import {canonical,type Business,type CustomerRule} from './business';
export function customerInactive(name:string,b:Business){return b.customers[canonical(name,b)]?.inactive===true;}
export function activeCustomerNames(names:string[],b:Business){return [...new Set(names.map(n=>canonical(n,b)))].filter(n=>n&&!customerInactive(n,b));}
export function manageCustomer(b:Business,input:any,recordNames:string[]){
 const clean=(value:unknown)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>200)throw Error('กรอกชื่อลูกค้า 1–200 ตัวอักษร');return value.trim();};
 const known=new Set([...recordNames,...Object.keys(b.customers),...Object.keys(b.aliases),...b.payments.map(p=>p.customer)].map(n=>canonical(n,b)));
 const fallback:CustomerRule={priceGroup:'retail',dueDays:null};
 if(input.action==='customerCreate'){
  const name=clean(input.name);
  if(known.has(canonical(name,b)))throw Error('มีชื่อลูกค้านี้แล้ว กรุณาเลือกจากรายชื่อเดิม');
  const rule=input.rule;
  if(!rule||!['retail','wholesale'].includes(rule.priceGroup)||!(rule.dueDays===null||Number.isInteger(rule.dueDays)&&rule.dueDays>=0&&rule.dueDays<=3650))throw Error('ข้อมูลราคาประจำหรือวันนัดจ่ายไม่ถูกต้อง');
  b.customers[name]={priceGroup:rule.priceGroup,dueDays:rule.dueDays,inactive:false};return name;
 }
 const from=canonical(clean(input.name),b);
 if(!known.has(from))throw Error('ไม่พบลูกค้าที่ต้องการแก้ไข');
 if(input.action==='customerStatus'){
  if(typeof input.inactive!=='boolean')throw Error('สถานะลูกค้าไม่ถูกต้อง');
  b.customers[from]={...(b.customers[from]||fallback),inactive:input.inactive};return from;
 }
 if(input.action==='customerRename'){
  const to=clean(input.newName);
  if(to===from)return from;
  if(known.has(canonical(to,b))&&canonical(to,b)!==from)throw Error('ชื่อนี้เป็นของลูกค้าอีกคน หากเป็นคนเดียวกันให้ใช้การรวมชื่อ');
  const rule={...(b.customers[from]||fallback)};
  // An old alias can become the main name again without creating an alias loop.
  delete b.aliases[to];b.aliases[from]=to;delete b.customers[from];b.customers[to]=rule;return to;
 }
 throw Error('คำสั่งลูกค้าไม่ถูกต้อง');
}
