import type {CSSProperties} from 'react';

// Stable product shades shared by stock, sales and production.
const shades: Record<string, string> = {
 'เนื้อเล็ก':'#FFF3E8','เนื้อใหญ่':'#FFE4CE','เนื้อเอ็น':'#FFD3AF','เนื้อจัมโบ้(อาหนุ่ย)':'#FFC28F','เนื้อสด':'#FFB373','เนื้อเปื่อย':'#F7A35E',
 'หมูเล็ก':'#F0F8EA','หมูใหญ่':'#E2F0D7','หมูเอ็น':'#D1E7BD','หมูบีบี':'#BBDD9B','หมูสับ':'#A5D17D','หมูสด':'#90C264','หมูเปื่อย':'#7DB253',
 'น้ำจิ้ม (ขวด20)':'#FFF8DA','น้ำจิ้ม (ขวด25)':'#FFF0B7','น้ำจิ้ม (เล็ก)':'#FFE58D','น้ำจิ้ม (กลาง)':'#FFDA63','น้ำจิ้ม (ใหญ่)':'#F8CC42',
 'เส้น':'#E8F4FC','ตับ':'#CAE5F8','หัวใจ':'#A7D1EF',
};
const normalized = Object.fromEntries(Object.entries(shades).map(([name,color])=>[name.replace(/\s/g,''),color]));
export function productColor(product:string){
 return normalized[product.replace(/\s/g,'')] ?? (product.startsWith('เนื้อ')?'#FFF3E8':product.startsWith('หมู')?'#F0F8EA':product.startsWith('น้ำจิ้ม')?'#FFF8DA':'#E8F4FC');
}
export function productColorStyle(product:string):CSSProperties{
 return {'--product-color':productColor(product)} as CSSProperties;
}
