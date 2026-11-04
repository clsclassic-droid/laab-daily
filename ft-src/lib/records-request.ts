import type {Entry} from './record-draft';
import type {Business} from './business';
import type {Overview} from './overview';
type RecordsData={records:Entry[];cancelled:Entry[];products:string[];opening:Record<string,number>;business:Business;overview:Overview};
type EarlyResult={data?:RecordsData;error?:string};
declare global {interface Window {__daothiamRecords?:{url:string;promise:Promise<EarlyResult>}}}

// Begin the initial request while the browser is still loading the application.
// This is a fresh request on every page visit, not a stored copy of the accounts.
export const recordsBootstrapScript=`(()=>{try{const month=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,7),url='/api/records?month='+month,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);window.__daothiamRecords={url,promise:fetch(url,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw Error(data.error||'โหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง');return {data};}).catch(error=>({error:error.name==='AbortError'?'รอข้อมูลนานเกินไป กรุณาลองอีกครั้ง':error.message})).finally(()=>clearTimeout(timer))};}catch{}})();`;

export async function loadRecords(url:string,signal:AbortSignal):Promise<RecordsData>{
 const early=typeof window!=='undefined'?window.__daothiamRecords:undefined;
 // Claim the one matching request. Later refreshes always ask the server again.
 if(early?.url===url){
  delete window.__daothiamRecords;
  const result=await new Promise<EarlyResult>((resolve,reject)=>{
   const abort=()=>reject(new DOMException('Aborted','AbortError'));
   if(signal.aborted){abort();return;}
   signal.addEventListener('abort',abort,{once:true});
   early.promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
  if(result.error||!result.data)throw Error(result.error||'โหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง');
  return result.data;
 }
 const response=await fetch(url,{signal});
 const data=await response.json() as RecordsData&{error?:string};
 if(!response.ok)throw Error(data.error||'โหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง');
 return data;
}
