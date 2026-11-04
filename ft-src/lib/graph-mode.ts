export function automaticGraphMode(start:string,end:string):'day'|'month'|'year'{
 const days=(Date.parse(end)-Date.parse(start))/86400000+1;
 return days<=31?'day':days<=730?'month':'year';
}
