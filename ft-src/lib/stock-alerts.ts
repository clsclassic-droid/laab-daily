export type StockFilter='all'|'remaining'|'low';
export function validStockMinimums(value:unknown,products:readonly string[]):value is Record<string,number>{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([p,n])=>products.includes(p)&&typeof n==='number'&&Number.isFinite(n)&&n>=0);
}
export function stockAlert(balance:number,minimum?:number){
 if(balance<0)return 'ยอดติดลบ';
 if(minimum===undefined)return '';
 if(balance===0)return 'หมด';
 return balance<minimum?'ใกล้หมด':'';
}
export function matchesStockFilter(filter:StockFilter,balance:number,minimum?:number){
 return filter==='all'||(filter==='remaining'?balance>0:!!stockAlert(balance,minimum));
}
