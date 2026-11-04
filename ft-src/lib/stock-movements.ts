import type {SaleLike} from './business';
export type StockMovements=Record<string,{produced:number;sold:number}>;
export function stockMovements(records:SaleLike[]):StockMovements{
 const totals:StockMovements={};
 for(const r of records){
  if(r.voided||r.historyOnly||!['production','sale'].includes(r.kind))continue;
  for(const i of r.items){const total=totals[i.product]??(totals[i.product]={produced:0,sold:0});if(r.kind==='production')total.produced+=i.quantity;else total.sold+=i.quantity;}
 }
 return totals;
}
