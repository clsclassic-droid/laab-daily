const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),ts=require(process.cwd()+'/node_modules/typescript');
function setup(fetch){let tasks=new Map(),id=0;const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/post-record.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,fetch,AbortController,setTimeout:(fn,ms)=>{tasks.set(++id,{fn,ms});return id},clearTimeout:id=>tasks.delete(id)});return {post:exports.postRecord,tasks,tick:ms=>{for(const [id,t] of [...tasks])if(t.ms===ms){tasks.delete(id);t.fn()}}};}
(async()=>{
let count=0,sent,resolve;const record={id:'same-id',items:[{quantity:21.5}]};let h=setup((url,opts)=>{count++;sent=opts;return new Promise(r=>resolve=r)}),slow=0;
let p=h.post(record,()=>slow++);h.tick(8000);assert.equal(slow,1);resolve({ok:true,json:async()=>({record})});let result=await p;assert.equal(result.response.record.id,record.id);assert.equal(h.tasks.size,0);assert.equal(count,1);assert.equal(JSON.parse(sent.body).items[0].quantity,21.5);
h=setup(()=>new Promise(()=>{}));p=h.post(record,()=>{});h.tick(60000);await assert.rejects(p);assert.equal(h.tasks.size,0);
let signal;h=setup((u,o)=>{signal=o.signal;return Promise.resolve({ok:true,json:()=>new Promise(()=>{})})});p=h.post(record,()=>{});await Promise.resolve();h.tick(60000);await assert.rejects(p);assert(signal.aborted);assert.equal(h.tasks.size,0);
h=setup(()=>Promise.reject(Error('offline')));await assert.rejects(h.post(record,()=>{}));assert.equal(h.tasks.size,0);
h=setup(async()=>({ok:false,json:async()=>({error:'conflict'})}));result=await h.post(record,()=>{});assert.equal(result.result.ok,false);assert.equal(result.response.error,'conflict');assert.equal(h.tasks.size,0);
assert.equal(record.id,'same-id');console.log('PASS: slow notice, success, offline, server rejection, fetch/body timeout, timer cleanup, unchanged record ID and no automatic retry.');
})().catch(e=>{console.error(e);process.exit(1)});
