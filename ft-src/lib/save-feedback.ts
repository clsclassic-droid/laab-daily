import {toast} from 'sonner';
export function savedFeedback(){
 const time=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
 toast.success('บันทึกแล้ว ✓ · '+time+' น.',{duration:7000});
}
export const saveFailure='ยังไม่ได้รับการยืนยันว่าบันทึกสำเร็จ ข้อมูลที่กรอกยังอยู่ ลองบันทึกอีกครั้งได้';
