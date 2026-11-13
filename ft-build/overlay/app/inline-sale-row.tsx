'use client';
import {productName,productUnit,productActive,productMode} from '@/lib/product-settings';
import {productColorStyle} from '@/lib/product-colors';
import {Save,X} from 'lucide-react';
import CustomerCombobox from './customer-combobox';
import {draftRecord,updateDraft,type Draft,type Entry} from '@/lib/record-draft';
import {basePrices,customerPrices,freeCustomer,type Business} from '@/lib/business';
export default function InlineSaleRow({colSpan=5,products=Object.keys(basePrices),visibleProducts=products,draft,business,names,disabled,saving,saveError,onSave,onChange,onRemove}:{colSpan?:number;products?:string[];visibleProducts?:string[];draft:Draft;business:Business;names:string[];disabled:boolean;saving:boolean;saveError?:string;onSave:()=>void;onChange:(draft:Draft)=>void;onRemove:()=>void}){
const label=(p:string)=>productName(p,business),unit=(p:string)=>productUnit(p,business);
 const f=draft.fields;
 const change=(key:string,value:string)=>onChange(updateDraft(draft,key,value,business));
 const locked=disabled||saving;const rates={...customerPrices(f.date,f.priceGroup,business,f.customer),...(draft.record.unitPrices||{})};const free=freeCustomer(f.customer,business);
 const rowProducts=Array.from(new Set([...visibleProducts,...products.filter(p=>Number(f['q:'+p]||0)!==0)]));
 function setRate(product:string,value:string){const nextRates={...rates};if(value==='')delete nextRates[product];else nextRates[product]=Number(value);const total=Math.round((Object.entries(nextRates).reduce((sum,[p,price])=>sum+Number(f['q:'+p]||0)*price,0)+Number(f.ship||0)+Number(draft.record.otherAmount||0))*100)/100;onChange({...draft,record:{...draft.record,unitPrices:nextRates},fields:{...f,total:String(total)}});}
 const amount=(value:string)=>Number(value||0).toLocaleString('th-TH',{maximumFractionDigits:2});
 return <tr className="inline-sale-draft" id={'draft-'+draft.record.id}><td colSpan={colSpan}><div className="inline-sale-content">
  <div className="inline-customer-controls">
    <CustomerCombobox value={f.customer} names={names} disabled={locked} onChange={name=>change('customer',name)}/>
    <div className="inline-footer-actions">
     <button type="button" className="rowsave" disabled={locked} onClick={onSave}><Save size={16}/>{saving?'กำลังบันทึก…':saveError?'ลองบันทึกอีกครั้ง':'บันทึก'}</button>
     <button type="button" disabled={locked} onClick={onRemove}><X size={16}/>เอาแถวออก</button>
    </div>
    <div className="inline-sale-checkout"><span>ยอดขาย <button type="button" className="inline-fill-paid" aria-label={'เติมช่องจ่าย '+amount(f.total)+' บาท'} title="แตะเพื่อเติมยอดนี้ในช่องจ่าย" disabled={locked||!Number.isFinite(Number(f.total||0))||Number(f.total||0)<0} onClick={()=>change('paid',String(Number(f.total||0)))}>{amount(f.total)}</button> บาท</span><label>ค่าส่ง<input aria-label="ค่าส่งแถวใหม่" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0" value={f.ship==='0'?'':f.ship||''} disabled={locked||free} onChange={e=>change('ship',e.target.value)}/></label><label>จ่าย<input aria-label="จ่ายแถวใหม่" type="number" step="0.01" inputMode="decimal" placeholder="0" value={f.paid==='0'?'':f.paid} disabled={locked} onChange={e=>change('paid',e.target.value)}/></label></div>
   </div>
  {saveError&&<p className="save-failure" role="alert">{saveError}</p>}
  <div className="inline-sale-scroll"><table className="inline-sale-table"><colgroup><col style={{width:82}}/>{rowProducts.map(p=><col key={p}/>)}<col style={{width:180}}/></colgroup><thead><tr>
   <th className="inline-price-cell" title="ราคาขายปลีก/ส่ง">ราคา</th>
   {rowProducts.map(p=><th key={p} className="product-shade" style={productColorStyle(p)}>{label(p)}<small>{unit(p)}</small></th>)}
   <th className="inline-note-cell">หมายเหตุ</th>
  </tr><tr>
   <td className="inline-price-cell"><select aria-label="ราคาที่ใช้แถวใหม่" value={f.priceGroup} disabled={locked} onChange={e=>change('priceGroup',e.target.value)}><option value="retail">ปลีก</option><option value="wholesale">ส่ง</option></select></td>
   {rowProducts.map(p=><td key={p} className="product-shade" style={productColorStyle(p)}><span className="inline-unit-price">{free?'×0':Number.isFinite(customerPrices(f.date,f.priceGroup,business,f.customer)[p])?'×'+amount(String(rates[p]??0)):<label className="inline-missing-price">×<input aria-label={'ราคาต่อหน่วย '+p} type="number" inputMode="decimal" min="0" step="any" placeholder="ราคา" value={rates[p]??''} disabled={locked} onChange={e=>setRate(p,e.target.value)}/></label>}</span><input aria-label={'จำนวน '+label(p)} type="number" step="any" inputMode="decimal" placeholder="0" value={f['q:'+p]||''} disabled={locked} onChange={e=>change('q:'+p,e.target.value)}/></td>)}
   <td className="inline-note-cell"><input aria-label="หมายเหตุแถวใหม่" value={f.note} disabled={locked} onChange={e=>change('note',e.target.value)}/></td>
  </tr></thead></table></div>
 </div></td></tr>;
}
