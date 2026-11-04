import type {Business} from './business';
import {basePrices} from './business';
export const catalogProducts:readonly string[]=["เนื้อเล็ก", "เนื้อใหญ่", "เนื้อเอ็น", "เนื้อจัมโบ้(อาหนุ่ย)", "หมูเล็ก", "หมูใหญ่", "หมูเอ็น", "หมูบีบี", "น้ำจิ้ม (ขวด20)", "น้ำจิ้ม (ขวด25)", "น้ำจิ้ม (เล็ก)", "น้ำจิ้ม (กลาง)", "น้ำจิ้ม (ใหญ่)", "เส้น", "เนื้อสด", "เนื้อเปื่อย", "ตับ", "หัวใจ", "หมูสับ", "หมูสด", "หมูเปื่อย"];
export const productCategories=['ลูกชิ้น','น้ำจิ้ม','เนื้อ','เส้น'] as const;
export type ProductCategory=typeof productCategories[number];
export function defaultProductCategory(product:string):ProductCategory{
 if(product.startsWith('น้ำจิ้ม'))return 'น้ำจิ้ม';
 if(product==='เส้น')return 'เส้น';
 return catalogProducts.indexOf(product)>=0&&catalogProducts.indexOf(product)<8?'ลูกชิ้น':'เนื้อ';
}
export function validProductCategories(value:unknown,b?:Business):value is Record<string,ProductCategory>{
 return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([p,c])=>knownProducts(b).includes(p)&&productCategories.includes(c as ProductCategory));
}
export function validPriceMap(value:unknown,b?:Business):value is Record<string,number>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const rates=value as Record<string,number>;
 return Object.keys(basePrices).every(p=>Object.hasOwn(rates,p))&&Object.entries(rates).every(([p,n])=>knownProducts(b).includes(p)&&Number.isFinite(n)&&n>=0);
}

export type ProductInfo={name:string;unit:'กก.'|'ขวด'|'ถุง';inactive?:boolean;deleted?:boolean};
export function knownProducts(b?:Business){return [...catalogProducts,...Object.keys(b?.productInfo||{}).filter(p=>!catalogProducts.includes(p))];}
export function allProducts(b?:Business){return knownProducts(b).filter(p=>!b?.productInfo?.[p]?.deleted);}
export function productName(p:string,b?:Business){return b?.productInfo?.[p]?.name||p;}
export function productUnit(p:string,b?:Business){return b?.productInfo?.[p]?.unit||(p.startsWith('น้ำจิ้ม')?(p.includes('ขวด')?'ขวด':'ถุง'):'กก.');}
export function productMode(p:string,b?:Business){const c=b?.productCategories?.[p]||defaultProductCategory(p);return c==='ลูกชิ้น'?'batch':c==='เนื้อ'?'raw':'piece';}
export function productActive(p:string,b?:Business){return !b?.productInfo?.[p]?.inactive&&!b?.productInfo?.[p]?.deleted;}
export function validProductInfo(value:unknown):value is Record<string,ProductInfo>{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const names=new Set<string>();
 for(const [key,info] of Object.entries(value) as [string,any][]){
  if(!catalogProducts.includes(key)&&!/^product-[a-f0-9-]{36}$/.test(key))return false;
  if(!info||typeof info!=='object'||Array.isArray(info)||typeof info.name!=='string'||!info.name.trim()||info.name.length>200||!['กก.','ขวด','ถุง'].includes(info.unit)||(info.inactive!==undefined&&typeof info.inactive!=='boolean')||(info.deleted!==undefined&&typeof info.deleted!=='boolean'))return false;
 }
 for(const p of [...catalogProducts,...Object.keys(value).filter(p=>!catalogProducts.includes(p))]){if((value as Record<string,ProductInfo>)[p]?.deleted)continue;const n=(value as Record<string,ProductInfo>)[p]?.name||p;if(names.has(n.trim()))return false;names.add(n.trim());}return true;
}
export function manageProduct(b:Business,input:any){
 const keys=allProducts(b);b.productInfo={...b.productInfo};
 if(input.action==='productCreate'){
  const name=typeof input.name==='string'?input.name.trim():'';
  if(!name||name.length>200||keys.some(p=>productName(p,b)===name))throw Error('กรอกชื่อสินค้าใหม่ที่ไม่ซ้ำกับสินค้าเดิม');
  if(!['กก.','ขวด','ถุง'].includes(input.unit)||!productCategories.includes(input.category))throw Error('เลือกประเภทและหน่วยสินค้า');
  const id='product-'+crypto.randomUUID();b.productInfo[id]={name,unit:input.unit,inactive:false};b.productCategories={...b.productCategories,[id]:input.category};return;
 }
 const p=input.product;if(!keys.includes(p))throw Error('ไม่พบสินค้า');
 const info:ProductInfo={...b.productInfo[p],name:productName(p,b),unit:productUnit(p,b)};
 if(input.action==='productRename'){
  const name=typeof input.name==='string'?input.name.trim():'';
  if(!name||name.length>200||keys.some(k=>k!==p&&productName(k,b)===name))throw Error('กรอกชื่อสินค้าที่ไม่ซ้ำกับสินค้าอื่น');info.name=name;
 }else if(input.action==='productStatus'){if(typeof input.inactive!=='boolean')throw Error('สถานะไม่ถูกต้อง');info.inactive=input.inactive;}
 else throw Error('คำสั่งไม่ถูกต้อง');b.productInfo[p]=info;
}
