'use client';
// ล็อกอินแบบเดียวกับเว็บร้านลาบ (Supabase Auth · อีเมล + รหัสผ่าน) · ใช้ session ร่วมกันเพราะอยู่โดเมนเดียวกัน
// ใช้แทน chatgpt-auth ของเว็บเดิม · หน้าเว็บเดิม (app/page.tsx) จะโหลดหลังล็อกอินแล้วเท่านั้น
import {useEffect,useState,type ReactNode,type FormEvent} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase,installAdapter,isReadOnly} from './supabase-adapter';

installAdapter();

function LoginScreen(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setErr('');
  const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
  if(error)setErr(error.message==='Invalid login credentials'?'อีเมลหรือรหัสผ่านไม่ถูกต้อง':error.message);
  setBusy(false);}
 return <main className="workspace" style={{maxWidth:360,margin:'60px auto'}}><section className="panel">
  <div className="brand" style={{marginBottom:16}}><div className="brandmark">ด</div><div><strong>ดาวเทียม</strong><small>เข้าสู่ระบบเพื่อบันทึกผลิตและขาย · โรงลูกชิ้น (FT)</small></div></div>
  <form onSubmit={submit}>
   <label>อีเมล<input type="email" required autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>
   <label style={{marginTop:12}}>รหัสผ่าน<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   {err&&<p className="notice error" role="alert" style={{marginTop:12}}>{err}</p>}
   <button className="save" type="submit" disabled={busy} style={{width:'100%',marginTop:16}}>{busy?'กำลังเข้าสู่ระบบ…':'เข้าสู่ระบบ'}</button>
  </form>
  <p className="muted">ใช้บัญชีเดียวกับเว็บร้านลาบ</p>
 </section></main>;
}

export default function AuthGate({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null|undefined>(undefined);
 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>setSession(data.session));
  const {data:sub}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
  return()=>sub.subscription.unsubscribe();
 },[]);
 if(session===undefined)return <p className="notice" role="status" style={{margin:24}}>กำลังตรวจสอบการเข้าสู่ระบบ…</p>;
 if(!session)return <LoginScreen/>;
 return <>{isReadOnly()&&<p className="notice" role="status" style={{margin:'8px 16px'}}>โหมดทดสอบ · อ่านอย่างเดียว ยังไม่บันทึกลงระบบจริง</p>}{children}</>;
}

// ปุ่มบนหัวเว็บ: ออกจากระบบ (ลิงก์ไปหน้าอื่นย้ายไปแถบเมนูกิจการ shared/site-nav.jsx) (ใส่ใน header ของ app/page.tsx)
export function HeaderLinks(){
 return <div className="private" style={{display:'flex',gap:12}}>
  <button type="button" onClick={()=>supabase.auth.signOut()} style={{background:'transparent',border:0,textDecoration:'underline',color:'inherit',minHeight:44,padding:'0 10px'}}>ออกจากระบบ</button>
 </div>;
}
