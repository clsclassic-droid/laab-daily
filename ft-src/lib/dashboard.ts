import {customerAccounts,isPurchase,canonical,customerNames,dueDate,receiptRows,type Business,type SaleLike} from './business';
export type Mode='day'|'month'|'year';
const iso=(d:Date)=>d.toISOString().slice(0,10);
const at=(s:string)=>new Date(s+'T12:00:00Z');
const last=(year:number,month:number)=>new Date(Date.UTC(year,month,0,12)).getUTCDate();
export function dashboardRange(mode:Mode,value:string,today:string,yearAgo:boolean){
 const fallback=mode==='day'?today:mode==='month'?today.slice(0,7):today.slice(0,4);
 const v=(mode==='day'?/^\d{4}-\d{2}-\d{2}$/:mode==='month'?/^\d{4}-\d{2}$/:/^\d{4}$/).test(value)?value:fallback;
 let start=mode==='day'?v:mode==='month'?v+'-01':v+'-01-01';if(!Number.isFinite(at(start).getTime()))start=mode==='day'?today:mode==='month'?today.slice(0,7)+'-01':today.slice(0,4)+'-01-01';
 const y=Number(start.slice(0,4)),m=Number(start.slice(5,7));
 let end=mode==='day'?start:mode==='month'?`${y}-${String(m).padStart(2,'0')}-${last(y,m)}`:`${y}-12-31`;
 const partial=start<=today&&today<=end&&mode!=='day';if(partial)end=today;
 let previousStart:string,previousEnd:string;
 if(mode==='day'&&!yearAgo){const d=at(start);d.setUTCDate(d.getUTCDate()-1);previousStart=previousEnd=iso(d);}
 else{const offset=mode==='year'||yearAgo?12:1;const d=new Date(Date.UTC(y,m-1-offset,1,12));const py=d.getUTCFullYear(),pm=d.getUTCMonth()+1;const prefix=`${py}-${String(pm).padStart(2,'0')}`;previousStart=mode==='year'?`${py}-01-01`:mode==='month'?prefix+'-01':prefix+'-'+String(Math.min(Number(start.slice(8,10)),last(py,pm))).padStart(2,'0');previousEnd=mode==='day'?previousStart:mode==='month'?prefix+'-'+String(Math.min(partial?Number(end.slice(8,10)):last(py,pm),last(py,pm))).padStart(2,'0'):partial?`${py}-${end.slice(5,7)}-${String(Math.min(Number(end.slice(8,10)),last(py,Number(end.slice(5,7))))).padStart(2,'0')}`:`${py}-12-31`;}
 return {start,end,previousStart,previousEnd,partial};
}
export function customDashboardRange(start:string,end:string,yearAgo:boolean){
 const date=(s:string)=>new Date(s+'T12:00:00Z');const isoDate=(d:Date)=>d.toISOString().slice(0,10);
 const shift=(s:string,n:number)=>{const d=date(s);d.setUTCDate(d.getUTCDate()+n);return isoDate(d);};
 const priorYear=(s:string)=>{const d=date(s),y=d.getUTCFullYear()-1,m=d.getUTCMonth();return isoDate(new Date(Date.UTC(y,m,Math.min(d.getUTCDate(),new Date(Date.UTC(y,m+1,0)).getUTCDate()),12)));};
 const days=Math.round((date(end).getTime()-date(start).getTime())/86400000)+1;
 return {start,end,previousStart:yearAgo?priorYear(start):shift(start,-days),previousEnd:yearAgo?priorYear(end):shift(start,-1),partial:false};
}
export const growth=(current:number,previous:number,available:boolean)=>!available||previous<=0?null:(current-previous)/previous*100;
export function dashboardData(records:SaleLike[],business:Business,range:ReturnType<typeof dashboardRange>,today:string){
 const active=records.filter(r=>!r.voided),within=(d:string,s:string,e:string)=>d>=s&&d<=e;
 const current=active.filter(r=>within(r.date,range.start,range.end)),previous=active.filter(r=>within(r.date,range.previousStart,range.previousEnd));
 const sales=current.filter(r=>r.kind==='sale'),prevSales=previous.filter(r=>r.kind==='sale');const receipts=receiptRows(active,business);
 const sum=(rs:SaleLike[])=>rs.reduce((n,r)=>n+r.total,0);const received=receipts.filter(r=>within(r.date,range.start,range.end)).reduce((n,r)=>n+r.amount,0);
 const prevReceived=receipts.filter(r=>within(r.date,range.previousStart,range.previousEnd)).reduce((n,r)=>n+r.amount,0);
 const accounts=customerAccounts(active,business);const customers=customerNames(active,business).map(name=>{const a=accounts[name],orders=sales.filter(r=>canonical(r.customer,business)===name),positive=a.purchases.filter(isPurchase),dates=new Set(orders.filter(isPurchase).map(r=>r.date));return {name,total:sum(orders),orders:orders.filter(isPurchase).length,days:dates.size,debt:Math.max(0,a.balance),credit:a.credit,last:positive.at(-1)?.date||'',overdue:a.sales.reduce((n,r)=>n+(dueDate(r,business)&&dueDate(r,business)<today?(a.remaining[r.id]||0):0),0),remaining:a.remaining,sales:a.sales};});
 const products=Array.from(new Set([...current,...previous].flatMap(r=>r.items.map(i=>i.product)))).map(name=>{const qty=(rs:SaleLike[],kind:string)=>rs.filter(r=>r.kind===kind).reduce((n,r)=>n+r.items.filter(i=>i.product===name).reduce((n,i)=>n+i.quantity,0),0);return {name,sold:qty(current,'sale'),produced:qty(current,'production'),previousSold:qty(previous,'sale'),previousProduced:qty(previous,'production')};});
 const debtBuckets={notDue:0,noDue:0,overdue:0,old:0};for(const c of customers)for(const r of c.sales){const amount=c.remaining[r.id]||0;if(amount<=0)continue;const due=dueDate(r,business);if(!due)debtBuckets.noDue+=amount;else if(due<today)debtBuckets.overdue+=amount;else debtBuckets.notDue+=amount;if((at(today).getTime()-at(r.date).getTime())/86400000>30)debtBuckets.old+=amount;}
 return {debtBuckets,sales,prevSales,current,previous,customers,products,receipts,total:sum(sales),previousTotal:sum(prevSales),received,prevReceived,orders:sales.filter(isPurchase).length,previousOrders:prevSales.filter(isPurchase).length,debt:customers.reduce((n,c)=>n+c.debt,0),overdue:customers.reduce((n,c)=>n+c.overdue,0),returns:-sales.filter(r=>r.total<0).reduce((n,r)=>n+r.total,0),missingReceipts:sales.filter(r=>r.paid!==0&&!r.receiptDate).reduce((n,r)=>n+r.paid,0)};
}
