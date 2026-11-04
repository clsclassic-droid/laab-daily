export function validDate(value:unknown):value is string{
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function monthCells(month:string){
 const [year,m]=month.split('-').map(Number);
 const first=new Date(Date.UTC(year,m-1,1)).getUTCDay();
 const count=new Date(Date.UTC(year,m,0)).getUTCDate();
 return Array.from({length:Math.ceil((first+count)/7)*7},(_,i)=>i<first||i>=first+count?'':`${month}-${String(i-first+1).padStart(2,'0')}`);
}
export function shiftMonth(month:string,delta:number){
 const [year,m]=month.split('-').map(Number);
 return new Date(Date.UTC(year,m-1+delta,1)).toISOString().slice(0,7);
}
