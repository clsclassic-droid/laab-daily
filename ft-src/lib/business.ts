import type {ProductInfo,ProductCategory} from './product-settings';
export const basePrices:Record<string,number>={'เนื้อเล็ก':150,'เนื้อใหญ่':150,'เนื้อเอ็น':150,'หมูเล็ก':130,'หมูใหญ่':130,'หมูเอ็น':130,'น้ำจิ้ม (ขวด20)':20,'น้ำจิ้ม (ขวด25)':25,'น้ำจิ้ม (เล็ก)':120,'น้ำจิ้ม (กลาง)':240,'น้ำจิ้ม (ใหญ่)':480,'เส้น':950};
export type PriceVersion={id:string;date:string;retail:Record<string,number>;wholesale:Record<string,number>};
export type CustomerRule={priceGroup:'retail'|'wholesale';dueDays:number|null;freeOfCharge?:boolean;inactive?:boolean};
export type Payment={id:string;customer:string;date:string;amount:number;note:string;voided?:boolean};
export type Business={stockMinimums?:Record<string,number>;productInfo?:Record<string,ProductInfo>;productCategories?:Record<string,ProductCategory>;prices:PriceVersion[];customers:Record<string,CustomerRule>;aliases:Record<string,string>;payments:Payment[];stockCounts?:StockCount[];invoiceDueDates?:Record<string,string>};
export const initialBusiness:Business={prices:[{id:'original',date:'2026-01-01',retail:{...basePrices},wholesale:{...basePrices}}],customers:{},aliases:{},payments:[]};
export function canonical(name:string,b:Business){let n=name.trim();const seen=new Set<string>();while(b.aliases[n]&&!seen.has(n)){seen.add(n);n=b.aliases[n];}return n;}
export function pricesAt(date:string,group:string,b:Business){const version=[...b.prices].sort((a,c)=>c.date.localeCompare(a.date)||c.id.localeCompare(a.id)).find(p=>p.date<=date);return version?(group==='wholesale'?version.wholesale:version.retail):basePrices;}
export function freeCustomer(name:string,b:Business){return b.customers[canonical(name,b)]?.freeOfCharge===true;}
export function customerPrices(date:string,group:string,b:Business,name:string){const prices=pricesAt(date,group,b);return freeCustomer(name,b)?Object.fromEntries(Object.keys(prices).map(p=>[p,0])):prices;}
export type SaleLike={id:string;kind:string;date:string;customer:string;total:number;paid:number;createdOrder?:number;dueDate?:string;dueDateFixed?:boolean;receiptDate?:string;voided?:boolean;historyOnly?:boolean;excelOutstanding?:number;items:{product:string;quantity:number}[];unitPrices?:Record<string,number>};
const cents=(n:number)=>Math.round(n*100);
export function account(records:SaleLike[],b:Business,name:string){const customer=canonical(name,b);const sales=records.filter(r=>r.kind==='sale'&&!r.voided&&!r.historyOnly&&canonical(r.customer,b)===customer).sort((a,c)=>a.date.localeCompare(c.date)||(a.createdOrder??0)-(c.createdOrder??0)||a.id.localeCompare(c.id));const payments=b.payments.filter(p=>!p.voided&&canonical(p.customer,b)===customer).sort((a,c)=>a.date.localeCompare(c.date)||a.id.localeCompare(c.id));const remaining:Record<string,number>={},allocations:Record<string,{saleId:string;amount:number}[]>={};let credit=0;for(const s of sales){const balance=cents(s.total)-cents(s.paid);remaining[s.id]=Math.max(0,balance);credit+=Math.max(0,-balance);}function apply(amount:number,list?:{saleId:string;amount:number}[]){for(const s of sales){if(amount<=0)break;const paid=Math.min(amount,remaining[s.id]);remaining[s.id]-=paid;amount-=paid;if(paid&&list)list.push({saleId:s.id,amount:paid/100});}return amount;}
 credit=apply(credit);for(const p of payments){const list:{saleId:string;amount:number}[]=[];credit+=apply(cents(p.amount),list);allocations[p.id]=list;}return {sales,payments,remaining:Object.fromEntries(Object.entries(remaining).map(([k,v])=>[k,v/100])),balance:(sales.reduce((n,s)=>n+cents(s.total)-cents(s.paid),0)-payments.reduce((n,p)=>n+cents(p.amount),0))/100,credit:credit/100,allocations};}
export function dueDate(r:SaleLike,b:Business){if(r.dueDateFixed)return r.dueDate||'';if(r.dueDate)return r.dueDate;if(Object.hasOwn(b.invoiceDueDates||{},r.id))return b.invoiceDueDates![r.id];const days=b.customers[canonical(r.customer,b)]?.dueDays;if(days==null)return '';const date=new Date(r.date+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
export function receiptRows(records:SaleLike[],b:Business){return [...records.filter(r=>r.kind==='sale'&&!r.voided&&r.paid!==0&&r.receiptDate).map(r=>({id:r.id,customer:canonical(r.customer,b),date:r.receiptDate!,amount:r.paid,note:'รับพร้อมรายการขาย'})),...b.payments.filter(p=>!p.voided).map(p=>({...p,customer:canonical(p.customer,b)}))];}

export type StockCount={id:string;date:string;note:string;items:{product:string;expected:number;actual:number;difference:number}[]};
export function stockBalances(records:SaleLike[],opening:Record<string,number>,b:Business){const result={...Object.fromEntries(Object.keys(b.productInfo||{}).map(p=>[p,0])),...opening};for(const r of records.filter(r=>!r.voided&&!r.historyOnly))for(const i of r.items)result[i.product]=(result[i.product]||0)+(r.kind==='production'?i.quantity:-i.quantity);for(const count of b.stockCounts||[])for(const i of count.items)result[i.product]=(result[i.product]||0)+i.difference;return result;}
export function customerNames(records:SaleLike[],b:Business){return Array.from(new Set([...records.filter(r=>r.kind==='sale'&&!r.voided).map(r=>canonical(r.customer,b)),...Object.keys(b.customers).map(n=>canonical(n,b)),...b.payments.map(p=>canonical(p.customer,b))])).filter(Boolean).sort((a,c)=>a.localeCompare(c,'th'));}

export function freezeDueDates(records:SaleLike[],b:Business,names:string[]){const customers=new Set(names.map(n=>canonical(n,b)));b.invoiceDueDates={...b.invoiceDueDates};for(const r of records){if(r.kind==='sale'&&customers.has(canonical(r.customer,b))&&!r.dueDateFixed&&!r.dueDate&&!Object.hasOwn(b.invoiceDueDates,r.id))b.invoiceDueDates[r.id]=dueDate(r,b);}}
export function paymentAmount(value:number){if(!Number.isFinite(value)||value<=0||Math.abs(value*100-Math.round(value*100))>0.000001)throw Error('จำนวนเงินต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง');return Math.round(value*100)/100;}
export function saleBreakdown(r:SaleLike){if(!r.unitPrices||r.items.some(i=>!Number.isFinite(r.unitPrices![i.product])))return null;const amount=Math.round(r.items.reduce((n,i)=>n+i.quantity*r.unitPrices![i.product],0)*100)/100;return {amount,adjustment:Math.round((r.total-amount)*100)/100};}

export function isPurchase(r:SaleLike){return !r.voided&&(r.total>0||r.total===0&&r.items.some(i=>i.quantity>0));}
export function customerAccounts(records:SaleLike[],b:Business){
 const purchases=new Map<string,SaleLike[]>(),payments=new Map<string,Payment[]>();
 const ensure=(name:string)=>{const n=canonical(name,b);if(n&&!purchases.has(n))purchases.set(n,[]);return n;};
 for(const r of records){if(r.kind!=='sale'||r.voided)continue;const n=ensure(r.customer);if(n)purchases.get(n)!.push(r);}
 for(const name of Object.keys(b.customers))ensure(name);
 for(const p of b.payments){const n=ensure(p.customer);const list=payments.get(n)||[];list.push(p);payments.set(n,list);}
 const result:Record<string,ReturnType<typeof account>&{purchases:SaleLike[]}>={};
 for(const [name,rows] of purchases){rows.sort((a,c)=>a.date.localeCompare(c.date)||(a.createdOrder??0)-(c.createdOrder??0)||a.id.localeCompare(c.id));result[name]={...account(rows,{...b,payments:payments.get(name)||[]},name),purchases:rows};}
 return result;
}
