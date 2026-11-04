'use client';
import {useState} from 'react';
import {Combobox,ComboboxInput,ComboboxContent,ComboboxList,ComboboxItem} from '@/components/ui/combobox';
export default function CustomerCombobox({value,names,disabled,onChange}:{value:string;names:string[];disabled:boolean;onChange:(name:string)=>void}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');
 const typed=value.trim(),newName=!!typed&&!names.includes(typed);
 const items=newName?[...names,typed]:names;
 const filtered=items.filter(name=>name.toLocaleLowerCase('th').includes(query.trim().toLocaleLowerCase('th')));
 return <div className="inline-customer-picker"><Combobox items={items} filteredItems={filtered} value={value||null} inputValue={value} open={open} openOnInputClick autoHighlight={false} disabled={disabled} onOpenChange={(next,details)=>{setOpen(next);if(next&&details.reason!=='input-change')setQuery('');}} onInputValueChange={(text,details)=>{if(details.reason==='input-change'){setQuery(text);onChange(text);}}} onValueChange={name=>{if(name!==null){onChange(name);setQuery('');setOpen(false);}}}>
 <ComboboxInput className="inline-customer-input" aria-label="ค้นหาหรือเลือกชื่อลูกค้าแถวใหม่" placeholder="ค้นหาหรือเลือกชื่อลูกค้า" autoComplete="off" disabled={disabled}/>
 <ComboboxContent className="inline-customer-menu" sideOffset={4}><ComboboxList className="inline-customer-list">{(name:string)=><ComboboxItem className="inline-customer-option" key={name} value={name}>{newName&&name===typed?'＋ ใช้ชื่อใหม่ “'+name+'”':name}</ComboboxItem>}</ComboboxList><button type="button" className="inline-customer-close" onClick={()=>setOpen(false)}>ปิดรายชื่อ</button></ComboboxContent>
 </Combobox></div>;
}
