'use client';
import {useEffect,useRef,useState} from 'react';
import {ChevronDown,Check,X} from 'lucide-react';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandGroup,CommandItem} from '@/components/ui/command';
import type {customerPickerGroups} from '@/lib/customer-picker';
type Props={groups:ReturnType<typeof customerPickerGroups>;query:string;onQueryChange:(s:string)=>void;onSelect:(s:string)=>void;active:boolean};
const fmt=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:2});
export default function CustomerPicker({groups,query,onQueryChange,onSelect,active}:Props){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const list=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!active)setOpen(false);},[active]);
 const term=search.trim().toLocaleLowerCase();
 return <div className="ranked-customer-field"><span>ค้นหาหรือเลือกลูกค้า</span><div className="ranked-customer-controls"><Popover open={open} onOpenChange={next=>{setOpen(next);if(next)setSearch('');}}><PopoverTrigger asChild><button type="button" role="combobox" aria-expanded={open} aria-label="ค้นหาหรือเลือกลูกค้า" className="ranked-customer-trigger"><span>{query||'เลือกชื่อลูกค้า'}</span><ChevronDown size={20}/></button></PopoverTrigger><PopoverContent className="ranked-customer-popover" align="start" onOpenAutoFocus={e=>{e.preventDefault();list.current?.focus({preventScroll:true});}} onCloseAutoFocus={e=>e.preventDefault()}><Command shouldFilter={false}><CommandInput aria-label="พิมพ์ค้นหาชื่อลูกค้า" placeholder="พิมพ์ชื่อ หรือเลือกจากรายการด้านล่าง" value={search} onValueChange={value=>{setSearch(value);onQueryChange(value);}}/><CommandList ref={list} tabIndex={0} aria-label="รายชื่อลูกค้าเรียงตามยอดค้างและความถี่ซื้อ"><CommandEmpty>ไม่พบชื่อลูกค้า</CommandEmpty>{groups.map(g=>{const options=g.options.filter(o=>!term||o.name.toLocaleLowerCase().includes(term));return options.length?<CommandGroup key={g.heading} heading={g.heading}>{options.map(o=><CommandItem key={o.name} value={o.name} onSelect={()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur();setOpen(false);onQueryChange(o.name);onSelect(o.name);}}><span className="ranked-customer-option"><strong>{o.name}</strong><small>{o.debt>0?'ค้าง '+fmt(o.debt)+' บาท':'ไม่มียอดค้าง'}{o.days>0?' · ซื้อ '+fmt(o.days)+' วันในปีนี้':''}</small></span>{query===o.name&&<Check size={18}/>}</CommandItem>)}</CommandGroup>:null;})}</CommandList></Command></PopoverContent></Popover>{query&&<button type="button" className="ranked-customer-clear" aria-label="ล้างชื่อและดูรายชื่อลูกค้าทั้งหมด" onClick={()=>onQueryChange('')}><X size={18}/></button>}</div></div>;
}
