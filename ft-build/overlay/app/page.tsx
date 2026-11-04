'use client';
import {useState,useEffect,useMemo,useCallback,useRef,lazy,Suspense} from 'react';
import type {Entry} from '@/lib/record-draft';
import {loadRecords} from '@/lib/records-request';
import {loadProduction,loadExpenses,loadBusiness,loadHistory,loadDashboard,preloadPanel} from './panel-loaders';
const RecordGrid=lazy(loadProduction);
const BusinessPanel=lazy(loadBusiness);
const ExpensesPanel=lazy(loadExpenses);
import SaleWorkspace from './sale-workspace';
import SaleCalendar from './sale-calendar';
import StockPanel from './stock-panel';
const HistoryPanel=lazy(loadHistory);
const Dashboard=lazy(loadDashboard);
import {HeaderLinks} from '@/src/auth-gate';
import type {Overview} from '@/lib/overview';
import {initialBusiness,type Business} from '@/lib/business';
import {Tabs,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {Toaster} from '@/components/ui/sonner';
import {toast} from 'sonner';
import {savedFeedback} from '@/lib/save-feedback';
import {Factory,ShoppingBag,Package,History,Satellite,ClipboardList,Users,Wallet,Banknote,Settings} from 'lucide-react';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const fmt=(n:number)=>n.toLocaleString('th-TH',{maximumFractionDigits:2});
export default function Page(){
 const [expenseBusy,setExpenseBusy]=useState(false);
 const [cancelled,setCancelled]=useState<Entry[]>([]);
 const [saleEntryOpen,setSaleEntryOpen]=useState(false),[selectedSaleDate,setSelectedSaleDate]=useState('');
 const [saleEdit,setSaleEdit]=useState<Entry|null>(null);
 const [business,setBusiness]=useState<Business>(initialBusiness),[businessBusy,setBusinessBusy]=useState(false);
 const [tab,setTab]=useState('sale'),[visited,setVisited]=useState<string[]>(['sale']);
 const [data,setData]=useState<Entry[]>([]),[products,setProducts]=useState<string[]>([]),[opening,setOpening]=useState<Record<string,number>>({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[month,setMonth]=useState(()=>today().slice(0,7));
 const [summary,setSummary]=useState<Overview|null>(null),[fullLoaded,setFullLoaded]=useState(false),[revision,setRevision]=useState(0);
 const generation=useRef(0);
 const loadedScope=useRef<{month:string;full:boolean}|null>(null);
 const [refreshing,setRefreshing]=useState(false),[refreshError,setRefreshError]=useState('');
 const needFull=fullLoaded||['history','summary','customers','debtors'].includes(tab);
 const refresh=()=>{generation.current++;setRevision(n=>n+1);};
 const day=today();
 const mutate=useCallback(async(input:unknown)=>{if(businessBusy)return false;setBusinessBusy(true);try{const response=await fetch('/api/business',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});const result:any=await response.json();if(!response.ok)throw Error(result.error);setBusiness(result);generation.current++;setRevision(n=>n+1);savedFeedback();return true;}catch(e){toast.error((e as Error).message);return false;}finally{setBusinessBusy(false);}},[businessBusy]);
 useEffect(()=>{const version=++generation.current,controller=new AbortController();const background=loadedScope.current?.month===month&&(!needFull||loadedScope.current.full);setError('');setRefreshError('');setLoading(!background);setRefreshing(background);let timedOut=false;const timeout=setTimeout(()=>{timedOut=true;controller.abort();},30000);
 (async()=>{try{const d=await loadRecords('/api/records?'+new URLSearchParams({month,...(!fullLoaded&&needFull?{full:'1'}:{}),...(fullLoaded?{summaryFull:'1'}:{})}),controller.signal);if(version!==generation.current)return;setData(old=>fullLoaded?[...old.filter(r=>!r.date.startsWith(month)),...d.records]:d.records);setCancelled(old=>fullLoaded?[...old.filter(r=>!r.date.startsWith(month)),...(d.cancelled||[])]:d.cancelled||[]);setProducts(d.products);setOpening(d.opening);setBusiness(d.business);setSummary(d.overview);loadedScope.current={month,full:needFull};if(needFull)setFullLoaded(true);
 }catch(e){if(version!==generation.current||controller.signal.aborted&&!timedOut)return;(background?setRefreshError:setError)(timedOut?'รอข้อมูลนานเกินไป กรุณาลองอีกครั้ง':(e as Error).message);}finally{clearTimeout(timeout);if(version===generation.current&&(!controller.signal.aborted||timedOut)){setLoading(false);setRefreshing(false);}}})();return()=>{clearTimeout(timeout);controller.abort();};},[month,needFull,revision]);
 useEffect(()=>{if(!summary)return;const timers=['production','history','customers'].map((name,index)=>setTimeout(()=>preloadPanel(name),300+index*600));return()=>timers.forEach(clearTimeout);},[!!summary]);
 useEffect(()=>{setVisited(old=>old.includes(tab)?old:[...old,tab]);},[tab]);
 useEffect(()=>{if(selectedSaleDate&&!selectedSaleDate.startsWith(month))setSelectedSaleDate('');},[month,selectedSaleDate]);
 useEffect(()=>{const ctx=(document as any).modelContext;if(!ctx?.registerTool)return;const lifecycle=new AbortController();Promise.resolve(ctx.registerTool({name:'start_record_entry',description:'เปิดแบบฟอร์มบันทึกผลิตหรือขาย ยังไม่บันทึกข้อมูล',inputSchema:{type:'object',properties:{kind:{type:'string',enum:['sale','production']}},required:['kind'],additionalProperties:false},annotations:{readOnlyHint:false},execute:async(input:any)=>{if(!['sale','production'].includes(input.kind))throw Error('Invalid kind');setTab(input.kind);return {opened:input.kind,saved:false};}},{signal:lifecycle.signal})).catch(console.error);return()=>lifecycle.abort();},[]);
 const stats=summary?.stats||{sales:0,count:0},received=summary?.received||0,outstanding=summary?.outstanding||0,balances=summary?.balances||{},remaining=summary?.remaining||{};
 const calendarDates=useMemo(()=>new Set(tab==='history'?[...(summary?.dates.sale||[]),...(summary?.dates.production||[])]:summary?.dates[tab==='production'?'production':'sale']||[]),[summary,tab]);
 const onSaved=useCallback((r:Entry)=>{generation.current++;setRefreshing(true);setData(old=>[r,...old.filter(x=>x.id!==r.id)]);setRevision(n=>n+1);},[]);
 const onSaleSaved=useCallback((r:Entry)=>{onSaved(r);setSelectedSaleDate(prev=>prev?r.date:'');},[onSaved]);
 const onStatusChanged=useCallback((r:Entry)=>{generation.current++;setRefreshing(true);setData(old=>r.voided?old.filter(x=>x.id!==r.id):[r,...old.filter(x=>x.id!==r.id)]);setCancelled(old=>r.voided?[r,...old.filter(x=>x.id!==r.id)]:old.filter(x=>x.id!==r.id));setSaleEdit(null);setRevision(n=>n+1);},[]);
 const showMonth=useCallback(()=>setSelectedSaleDate(''),[]);
 const edit=useCallback((r:Entry)=>{setTab(r.kind);setMonth(r.date.slice(0,7));setSelectedSaleDate(r.date);if(r.kind==='sale'){setSaleEdit({...r});return;}setTimeout(()=>{const row=document.getElementById('grid-'+r.id);row?.scrollIntoView({block:'center',behavior:'smooth'});row?.querySelector('input')?.focus();},80);},[]);
 const monthLabel=new Date(month+'-01T12:00:00Z').toLocaleDateString('th-TH',{month:'short',year:'numeric'});
 const periodVisible=['sale','production','history'].includes(tab)&&!(tab==='sale'&&saleEntryOpen);
 return <main><Toaster position="top-center"/><header><div className="brand"><span className="brandmark"><Satellite size={25}/></span><div><strong>ลูกชิ้นตราดาวเทียม</strong></div></div><HeaderLinks/></header><div className="workspace"><Tabs value={tab} onValueChange={next=>{preloadPanel(next);setTab(next);}}><TabsList className="navigation"><TabsTrigger value="sale"><ShoppingBag/>ขาย</TabsTrigger><TabsTrigger value="production" onPointerEnter={()=>preloadPanel('production')} onPointerDown={()=>preloadPanel('production')} onFocus={()=>preloadPanel('production')}><Factory/>ผลิต</TabsTrigger><TabsTrigger value="stock"><Package/>สต๊อก</TabsTrigger><TabsTrigger value="debtors" onPointerEnter={()=>preloadPanel('debtors')} onPointerDown={()=>preloadPanel('debtors')} onFocus={()=>preloadPanel('debtors')}><Wallet/>รายรับ</TabsTrigger><TabsTrigger value="expenses" onPointerEnter={()=>preloadPanel('expenses')} onPointerDown={()=>preloadPanel('expenses')} onFocus={()=>preloadPanel('expenses')}><Banknote/>รายจ่าย</TabsTrigger><TabsTrigger value="history" onPointerEnter={()=>preloadPanel('history')} onPointerDown={()=>preloadPanel('history')} onFocus={()=>preloadPanel('history')}><History/>ย้อนหลัง</TabsTrigger><TabsTrigger value="summary" onPointerEnter={()=>preloadPanel('summary')} onPointerDown={()=>preloadPanel('summary')} onFocus={()=>preloadPanel('summary')}><ClipboardList/>สรุปยอด</TabsTrigger><TabsTrigger value="customers" onPointerEnter={()=>preloadPanel('customers')} onPointerDown={()=>preloadPanel('customers')} onFocus={()=>preloadPanel('customers')}><Users/>ลูกค้า</TabsTrigger><TabsTrigger value="prices" onPointerEnter={()=>preloadPanel('prices')} onPointerDown={()=>preloadPanel('prices')} onFocus={()=>preloadPanel('prices')}><Settings/>ตั้งค่า</TabsTrigger></TabsList></Tabs>
 {periodVisible&&<section className={tab==='production'?'period-toolbar':'metrics metrics-with-calendar'}>{tab!=='production'&&<><article><small>ยอดขาย {monthLabel}</small><strong>{loading||error?'—':fmt(stats.sales)}</strong><span>{loading||error?'—':fmt(stats.count)} รายการ</span></article><article><small>เงินรับจริง {monthLabel}</small><strong className="money-paid">{loading||error?'—':fmt(received)}</strong><span>ตามวันที่รับเงิน</span></article><article><small>ยอดค้างปัจจุบัน</small><strong className="red">{loading||error?'—':fmt(outstanding)}</strong><span>ทุกเดือน ตั้งแต่ปี 2026</span></article></>}{tab==='production'&&<span>ช่วงวันที่ผลิต</span>}<SaleCalendar month={month} date={selectedSaleDate} today={day} dates={calendarDates} label={tab==='production'?'ผลิต':tab==='history'?'ย้อนหลัง':'ขาย'} onDay={d=>{setMonth(d.slice(0,7));setSelectedSaleDate(d);}} onMonth={m=>{setMonth(m);setSelectedSaleDate('');}}/></section>}
 {loading&&<div className="notice" role="status">กำลังโหลดข้อมูลผลิตและขาย…</div>}{refreshing&&<div className="notice" role="status">กำลังอัปเดตยอดสรุป · สามารถกรอกรายการถัดไปได้ ยอดที่แสดงอาจยังไม่รวมการเปลี่ยนแปลงล่าสุด</div>}{refreshError&&<div className="notice error" role="alert">ยังอัปเดตยอดสรุปไม่ได้ · รายการที่ยืนยันว่าบันทึกแล้วถูกเก็บเรียบร้อย <button onClick={refresh}>อัปเดตยอดอีกครั้ง</button></div>}{error&&<div className="notice error" role="alert">{error} <button onClick={refresh}>ลองอีกครั้ง</button></div>}
 <div hidden={tab!=='sale'||(loading||!!error)&&!data.length}><SaleWorkspace products={products} selectedDate={selectedSaleDate} onShowMonth={showMonth} onEntryChange={setSaleEntryOpen} active={tab==='sale'} data={data} rankedNames={summary?.names} remotePrevious={!fullLoaded} cancelled={cancelled} onStatusChanged={onStatusChanged} business={business} remaining={remaining} month={month} today={day} disabled={loading||!!error} onSaved={onSaleSaved} onSelectMonth={setMonth} editRecord={saleEdit}/></div>
 <Suspense fallback={tab==='production'?<div className="notice" role="status">กำลังเปิดหน้าผลิต…</div>:null}>{visited.includes('production')&&<div hidden={tab!=='production'}><RecordGrid onSelectDate={setSelectedSaleDate} selectedDate={selectedSaleDate} onShowMonth={showMonth} business={business} remaining={remaining} active={tab==='production'} kind="production" data={data} products={products} month={month} today={day} disabled={loading||!!error} onSelectMonth={setMonth} onSaved={onSaved}/></div>}</Suspense>
 <Suspense fallback={tab==='expenses'?<div className="notice" role="status">กำลังเปิดรายจ่าย…</div>:null}>{visited.includes('expenses')&&<div hidden={tab!=='expenses'}><ExpensesPanel today={day} active={tab==='expenses'} onBusy={setExpenseBusy}/></div>}</Suspense>
 <Suspense fallback={['customers','debtors','prices'].includes(tab)?<div className="notice" role="status">กำลังเปิดหน้า…</div>:null}>{['customers','debtors','prices'].filter(t=>visited.includes(t)).map(t=><div hidden={tab!==t} key={t}>{(fullLoaded||t==='prices'&&products.length>0)&&<BusinessPanel products={products} active={tab===t} tab={t} records={data} business={business} today={day} mutate={mutate} busy={businessBusy||loading||refreshing||!!refreshError||!!error}/>}</div>)}</Suspense>
 <Suspense fallback={tab==='summary'?<div className="notice" role="status">กำลังเปิดสรุปยอด…</div>:null}>{tab==='summary'&&fullLoaded&&!loading&&!error&&<Dashboard records={data} business={business} today={day}/>}</Suspense>
 {summary&&visited.includes('stock')&&<div hidden={tab!=='stock'}><StockPanel movementSummary={summary.movements} records={data} products={products} opening={opening} balances={balances} business={business} today={day} mutate={mutate} busy={businessBusy||loading||refreshing||!!refreshError||!!error}/></div>}
 <Suspense fallback={tab==='history'?<div className="notice" role="status">กำลังเปิดย้อนหลัง…</div>:null}>{fullLoaded&&visited.includes('history')&&<div hidden={tab!=='history'}><HistoryPanel records={data} business={business} month={month} date={selectedSaleDate} remaining={remaining} onEdit={edit} onShowMonth={showMonth}/></div>}</Suspense><footer>ข้อมูลผลิตและขายจาก Excel · ประวัติก่อนปี 2026 ใช้ดูย้อนหลังและสรุปยอด ไม่รวมกับสต๊อกและยอดค้างปัจจุบัน · รายการติดลบคงไว้ตามต้นฉบับ</footer></div></main>;
}
