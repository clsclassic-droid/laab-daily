type SaleRow={id:string;date:string;total:number;paid:number;voided?:boolean;historyOnly?:boolean;excelOutstanding?:number};
export function groupSaleDays<T extends SaleRow>(rows:T[],remaining:Record<string,number>,addDate=''){
 const groups=new Map<string,{date:string;rows:T[];total:number;paid:number;balance:number}>();
 for(const row of rows){if(row.voided)continue;let day=groups.get(row.date);if(!day){day={date:row.date,rows:[],total:0,paid:0,balance:0};groups.set(row.date,day);}day.rows.push(row);day.total+=row.total;day.paid+=row.paid;day.balance+=row.historyOnly?(row.excelOutstanding||0):(remaining[row.id]??Math.max(0,row.total-row.paid));}
 if(addDate&&!groups.has(addDate))groups.set(addDate,{date:addDate,rows:[],total:0,paid:0,balance:0});
 return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(day=>({...day,total:Math.round(day.total*100)/100,paid:Math.round(day.paid*100)/100,balance:Math.round(day.balance*100)/100}));
}
