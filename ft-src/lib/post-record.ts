// A timeout means confirmation is unknown, never that the write was rolled back.
// Keep the caller's draft and ID so an explicit retry updates the same record.
export async function postRecord(record:unknown,onSlow:()=>void){
 const controller=new AbortController();
 const slow=setTimeout(onSlow,8000);
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{
  return await Promise.race([
   (async()=>{const result=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record),signal:controller.signal});const response:any=await result.json();return {result,response};})(),
   new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('ยังไม่ได้รับการยืนยันว่าบันทึกสำเร็จ'));},60000);})
  ]);
 }finally{clearTimeout(slow);if(timeout)clearTimeout(timeout);}
}
