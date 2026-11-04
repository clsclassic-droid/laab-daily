import {cents,employeeBalance,rateAt,type Expenses,type Employee} from './expenses';
export type DayStatus='unset'|'full'|'half'|'off';
export function laborDayPreview(state:Expenses,employee:Employee,date:string,status:DayStatus,amount=0){
 const previous=state.attendance.find(a=>a.employeeId===employee.id&&a.date===date);
 const rate=previous?{amount:previous.rate,type:previous.type}:rateAt(employee,date);
 const earned=rate?.type==='daily'?cents(rate.amount*(status==='full'?1:status==='half'?.5:0)):0;
 const saved=employeeBalance(state,employee,date);
 const available=cents(saved.balance-(previous?.earned||0)+earned);
 const after=cents(available-amount);
 const paidToday=cents(state.laborPayments.filter(p=>p.employeeId===employee.id&&p.date===date&&!p.voided).reduce((n,p)=>n+p.amount,0));
 const todayDue=cents(Math.max(0,Math.min(earned-paidToday,available)));
 const depositToday=cents(Math.max(0,todayDue-amount));
 return {rate,earned,available,todayDue,depositToday,dueBefore:Math.max(0,available),due:Math.max(0,after),advance:Math.max(0,-after),paidToday};
}
