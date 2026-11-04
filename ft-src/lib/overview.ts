import {stockMovements} from './stock-movements';
import {activeCustomerNames} from './customer-management';
import {canonical,customerNames,customerAccounts,receiptRows,stockBalances,isPurchase,type Business,type SaleLike} from './business';
// One accounting implementation is shared by the server overview and detailed ledgers.
export function overview(records:SaleLike[],opening:Record<string,number>,business:Business,month:string,full=false){
 const active=records.filter(r=>!r.voided),visible=full?active:active.filter(r=>r.date.startsWith(month));
 const accounts=Object.values(customerAccounts(active,business));
 const remaining:Record<string,number>={};const ids=new Set(visible.map(r=>r.id));
 for(const account of accounts)for(const [id,value] of Object.entries(account.remaining))if(ids.has(id))remaining[id]=value;
 const sales=active.filter(r=>r.kind==='sale'&&r.date.startsWith(month));
 const purchaseDays=new Map<string,Set<string>>();
 for(const sale of active){if(sale.kind!=='sale'||!isPurchase(sale))continue;const name=canonical(sale.customer,business);const days=purchaseDays.get(name)||new Set<string>();days.add(sale.date);purchaseDays.set(name,days);}
 const names=activeCustomerNames(customerNames(active,business),business);const frequent=names.filter(n=>purchaseDays.has(n)).sort((a,b)=>(purchaseDays.get(b)?.size||0)-(purchaseDays.get(a)?.size||0)||a.localeCompare(b,'th')).slice(0,15);
 return {stats:{sales:sales.reduce((n,r)=>n+r.total,0),count:sales.length},received:receiptRows(active,business).filter(p=>p.date.startsWith(month)).reduce((n,p)=>n+p.amount,0),outstanding:accounts.reduce((n,a)=>n+Math.max(0,a.balance),0),balances:stockBalances(active,opening,business),movements:stockMovements(active),remaining,names:[...frequent,...names.filter(n=>!frequent.includes(n))],dates:{sale:[...new Set(active.filter(r=>r.kind==='sale').map(r=>r.date))],production:[...new Set(active.filter(r=>r.kind==='production').map(r=>r.date))]}};
}
export type Overview=ReturnType<typeof overview>;
export function previousPurchase(records:SaleLike[],business:Business,name:string,date:string,exclude:string){return records.filter(r=>r.kind==='sale'&&!r.voided&&canonical(r.customer,business)===canonical(name,business)&&r.id!==exclude&&r.date<=date&&r.items.some(i=>i.quantity>0)).sort((a,b)=>b.date.localeCompare(a.date)||(b.createdOrder??0)-(a.createdOrder??0)||b.id.localeCompare(a.id))[0]||null;}
