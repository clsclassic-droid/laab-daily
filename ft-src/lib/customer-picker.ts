import {isPurchase,type customerAccounts} from './business';
type Accounts=ReturnType<typeof customerAccounts>;
export function customerPickerGroups(accounts:Accounts,today:string){
 const yearStart=today.slice(0,4)+'-01-01';
 const options=Object.entries(accounts).map(([name,a])=>({name,debt:Math.max(0,a.balance),days:new Set(a.purchases.filter(r=>r.date>=yearStart&&r.date<=today&&isPurchase(r)).map(r=>r.date)).size}));
 const named=options.filter(o=>!/ขาจร|ลูกค้าอื่น|ไม่ระบุลูกค้า/.test(o.name));
 const debts=named.filter(o=>o.debt>0).sort((a,b)=>b.debt-a.debt||b.days-a.days||a.name.localeCompare(b.name,'th')).slice(0,5);
 const used=new Set(debts.map(o=>o.name));
 const frequent=named.filter(o=>o.days>0&&!used.has(o.name)).sort((a,b)=>b.days-a.days||b.debt-a.debt||a.name.localeCompare(b.name,'th')).slice(0,5);
 frequent.forEach(o=>used.add(o.name));
 const rest=options.filter(o=>!used.has(o.name)).sort((a,b)=>a.name.localeCompare(b.name,'th'));
 return [{heading:'ยอดค้างมาก',options:debts},{heading:'ซื้อบ่อยในปีนี้',options:frequent},{heading:'ลูกค้าอื่น ๆ',options:rest}].filter(g=>g.options.length);
}
