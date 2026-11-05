'use client';
import {useEffect,useRef,useState,type CSSProperties} from 'react';
import {bindTablePinch,clampTableZoom} from '@/lib/table-pinch';
// ย่อ–ขยายตาราง: ตัวหนังสือไม่เล็กกว่า 13.5px คอลัมน์กว้างพอดีตัวหนังสือ (ใช้คู่กับคลาส .mzt ใน globals.css)
export function useTableZoom(){
 const [zoom,setZoom]=useState(1),zoomRef=useRef(1);zoomRef.current=zoom;
 const [el,setEl]=useState<HTMLElement|null>(null);
 useEffect(()=>{if(!el)return;return bindTablePinch(el,()=>zoomRef.current,n=>setZoom(n));},[el]);
 return {zoom,setZoom,ref:setEl,style:{'--mz':String(zoom)} as CSSProperties};
}
export function ZoomControls({zoom,setZoom}:{zoom:number;setZoom:(f:(n:number)=>number)=>void}){
 return <div className="zoom-controls" role="group" aria-label="ขนาดตาราง"><button type="button" aria-label="ย่อตาราง" onClick={()=>setZoom(n=>clampTableZoom(n-.1))}>−</button><span>{Math.round(zoom*100)}%</span><button type="button" aria-label="ขยายตาราง" onClick={()=>setZoom(n=>clampTableZoom(n+.1))}>+</button><button type="button" onClick={()=>setZoom(()=>1)}>คืนขนาด</button></div>;
}
