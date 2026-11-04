export const stockCardStorageKey='daothiam-stock-cards-v1';
export const stockCardLayoutEvent='daothiam-stock-cards-changed';
export type StockCardLayout={order:string[];hidden:string[]};
export function readStockCardLayout():StockCardLayout{
 try{const value=JSON.parse(localStorage.getItem(stockCardStorageKey)||'null');const names=(v:unknown)=>Array.isArray(v)?[...new Set(v.filter((p):p is string=>typeof p==='string'))]:[];return {order:names(value?.order),hidden:names(value?.hidden)};}catch{return {order:[],hidden:[]};}
}
export function visibleStockProducts(products:string[],layout:StockCardLayout){return [...layout.order.filter(p=>products.includes(p)),...products.filter(p=>!layout.order.includes(p))].filter(p=>!layout.hidden.includes(p));}
