import {validateExpenses} from './expenses';
import {validStockMinimums} from './stock-alerts';
import {knownProducts,validProductInfo,validPriceMap,validProductCategories} from './product-settings';
import {basePrices} from './business';
export const MAX_BACKUP_BYTES=32*1024*1024;
const object=(x:any)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const text=(x:any,max=200)=>typeof x==='string'&&x.length<=max;
const name=(x:any)=>text(x)&&x.trim().length>0;
const number=(x:any)=>typeof x==='number'&&Number.isFinite(x);
const date=(x:any)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T12:00:00Z'))&&new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x;
const product=(x:any)=>Object.hasOwn(basePrices,x)||['เนื้อจัมโบ้(อาหนุ่ย)','หมูบีบี','เนื้อสด','เนื้อเปื่อย','ตับ','หัวใจ','หมูสับ','หมูสด','หมูเปื่อย'].includes(x);
function requireValid(ok:boolean,message:string):asserts ok{if(!ok)throw Error(message);}
function unique(list:any[],label:string){const ids=new Set();for(const x of list){requireValid(object(x)&&name(x.id)&&!ids.has(x.id),label+' มีรหัสซ้ำหรือไม่ถูกต้อง');ids.add(x.id);}}
export function validateBackup(value:any){
 requireValid(object(value)&&value.format==='daothiam-backup'&&value.version===1,'เลือกไฟล์สำรอง .json ของเว็บดาวเทียม เวอร์ชัน 1');
 requireValid(Array.isArray(value.records)&&value.records.length<=50000,'รายการในไฟล์ไม่ถูกต้องหรือเกิน 50,000 รายการ');
 requireValid(object(value.settings)&&Object.keys(value.settings).every(k=>['opening','import-v1','business-v1','expenses-v1'].includes(k))&&text(value.settings.opening,MAX_BACKUP_BYTES),'ข้อมูลตั้งต้นในไฟล์ไม่ครบ');
 const settings:Record<string,string>={};for(const [k,v] of Object.entries(value.settings)){requireValid(text(v,MAX_BACKUP_BYTES),'ค่าตั้งต้นไม่ถูกต้อง');settings[k]=v as string;}
 if(settings['expenses-v1'])validateExpenses(JSON.parse(settings['expenses-v1']));
 const catalogBusiness=settings['business-v1']?JSON.parse(settings['business-v1']):undefined;
 if(catalogBusiness?.productInfo!==undefined)requireValid(validProductInfo(catalogBusiness.productInfo),'ข้อมูลสินค้าไม่ถูกต้อง');
 const product=(p:any)=>knownProducts(catalogBusiness).includes(p);
 const opening=JSON.parse(settings.opening);requireValid(object(opening)&&Object.entries(opening).every(([p,n])=>product(p)&&number(n)),'ยอดต้นปีไม่ถูกต้อง');
 requireValid(settings['import-v1']==='done','สถานะข้อมูลเริ่มต้นไม่ครบ');
 if(settings['business-v1']){
 const b=JSON.parse(settings['business-v1']);requireValid(object(b)&&Array.isArray(b.prices)&&b.prices.length>0&&object(b.customers)&&object(b.aliases)&&Array.isArray(b.payments),'ข้อมูลราคา ลูกค้า หรือรับเงินไม่ครบ');
 if(b.productCategories!==undefined)requireValid(validProductCategories(b.productCategories,b),'ประเภทสินค้าไม่ถูกต้อง');
 unique(b.prices,'ราคา');for(const p of b.prices){requireValid(date(p.date)&&['retail','wholesale'].every(g=>validPriceMap(p[g],b)),'ข้อมูลราคาสินค้าไม่ถูกต้อง');}
 requireValid(Object.entries(b.customers).every(([n,r]:[string,any])=>name(n)&&object(r)&&['retail','wholesale'].includes(r.priceGroup)&&(r.freeOfCharge===undefined||typeof r.freeOfCharge==='boolean')&&(r.inactive===undefined||typeof r.inactive==='boolean')&&(r.dueDays===null||Number.isInteger(r.dueDays)&&r.dueDays>=0&&r.dueDays<=3650)),'ข้อมูลลูกค้าไม่ถูกต้อง');
 requireValid(Object.entries(b.aliases).every(([n,v])=>name(n)&&name(v)),'ชื่อเชื่อมโยงลูกค้าไม่ถูกต้อง');
 for(const n of Object.keys(b.aliases)){const seen=new Set();let next=n;while(Object.hasOwn(b.aliases,next)){requireValid(!seen.has(next),'ชื่อเชื่อมโยงลูกค้าวนซ้ำ');seen.add(next);next=b.aliases[next];}}
 unique(b.payments,'รับเงิน');for(const p of b.payments)requireValid(name(p.customer)&&date(p.date)&&number(p.amount)&&p.amount>0&&text(p.note||'',2000)&&(p.voided===undefined||typeof p.voided==='boolean'),'รายการรับเงินไม่ถูกต้อง');
 if(b.stockMinimums!==undefined)requireValid(validStockMinimums(b.stockMinimums,knownProducts(b)),'ยอดขั้นต่ำสต๊อกไม่ถูกต้อง');
 if(b.stockCounts!==undefined){requireValid(Array.isArray(b.stockCounts),'ประวัตินับสต๊อกไม่ถูกต้อง');unique(b.stockCounts,'นับสต๊อก');for(const c of b.stockCounts){requireValid(date(c.date)&&text(c.note||'',2000)&&Array.isArray(c.items)&&c.items.every((i:any)=>object(i)&&product(i.product)&&number(i.expected)&&number(i.actual)&&i.actual>=0&&number(i.difference)&&Math.abs(i.difference-(i.actual-i.expected))<0.00001),'จำนวนในประวัตินับสต๊อกไม่ถูกต้อง');}}
 if(b.invoiceDueDates!==undefined)requireValid(object(b.invoiceDueDates)&&Object.entries(b.invoiceDueDates).every(([id,d])=>name(id)&&(d===''||date(d))),'วันนัดชำระไม่ถูกต้อง');
 }
 unique(value.records,'รายการขายหรือผลิต');for(const r of value.records){
 requireValid(['sale','production'].includes(r.kind)&&date(r.date)&&text(r.customer)&&number(r.total)&&number(r.paid)&&text(r.note||'',2000),'ข้อมูลรายการขายหรือผลิตไม่ถูกต้อง');
 requireValid(Array.isArray(r.items)&&(r.items.length>0||r.historyOnly===true&&r.date<'2026-01-01')&&r.items.length<=500&&r.items.every((i:any)=>object(i)&&product(i.product)&&number(i.quantity)&&(i.input===undefined||number(i.input))),'สินค้า หรือจำนวนในรายการไม่ถูกต้อง');
 if(r.kind==='sale')requireValid(name(r.customer),'รายการขายไม่มีชื่อลูกค้า');
 if(r.unitPrices!==undefined)requireValid(object(r.unitPrices)&&Object.entries(r.unitPrices).every(([p,n])=>product(p)&&number(n)&&Number(n)>=0),'ราคาต่อหน่วยไม่ถูกต้อง');
 for(const k of ['dueDate','receiptDate'])if(r[k])requireValid(date(r[k]),'วันที่รับเงินหรือนัดชำระไม่ถูกต้อง');
 if(r.priceGroup!==undefined)requireValid(['','retail','wholesale'].includes(r.priceGroup),'ประเภทขายไม่ถูกต้อง');
 for(const k of ['voided','dueDateFixed','historyOnly'])if(r[k]!==undefined)requireValid(typeof r[k]==='boolean','สถานะรายการไม่ถูกต้อง');
 if(r.createdOrder!==undefined)requireValid(number(r.createdOrder),'ลำดับรายการไม่ถูกต้อง');
 }
 return {format:'daothiam-backup' as const,version:1,createdAt:text(value.createdAt)?value.createdAt:'',label:text(value.label)?value.label:'นำเข้าจากไฟล์',settings,records:value.records as any[]};
}
