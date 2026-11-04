import type {Business} from './business';
import {allProducts,productName,productUnit} from './product-settings';
export const noProductHistorySQL=`NOT EXISTS (SELECT 1 FROM records r, json_each(json_extract(r.payload,'$.items')) i WHERE json_extract(i.value,'$.product')=?) AND NOT EXISTS (SELECT 1 FROM settings s,json_each(s.value) i WHERE s.key='opening' AND i.key=? AND CAST(i.value AS REAL)<>0)`;
export function hasStockCount(product:string,b:Business){return (b.stockCounts||[]).some(c=>c.items.some(i=>i.product===product));}
export function markProductDeleted(product:string,b:Business){if(!allProducts(b).includes(product))throw Error('ไม่พบสินค้า');if(hasStockCount(product,b))throw Error('มีประวัติปรับสต๊อก ลบไม่ได้ กรุณาเลือกเลิกใช้งาน');b.productInfo={...b.productInfo,[product]:{name:productName(product,b),unit:productUnit(product,b),inactive:true,deleted:true}};}
