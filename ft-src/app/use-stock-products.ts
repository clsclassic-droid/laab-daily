'use client';
import {useEffect,useState} from 'react';
import {readStockCardLayout,stockCardLayoutEvent,stockCardStorageKey,visibleStockProducts,type StockCardLayout} from '@/lib/stock-card-layout';
export function useStockProducts(products:string[]){
 const [layout,setLayout]=useState<StockCardLayout>({order:[],hidden:[]});
 useEffect(()=>{const refresh=()=>setLayout(readStockCardLayout());const storage=(e:StorageEvent)=>{if(e.key===stockCardStorageKey||e.key===null)refresh();};refresh();window.addEventListener(stockCardLayoutEvent,refresh);window.addEventListener('storage',storage);return()=>{window.removeEventListener(stockCardLayoutEvent,refresh);window.removeEventListener('storage',storage);};},[]);
 return visibleStockProducts(products,layout);
}
