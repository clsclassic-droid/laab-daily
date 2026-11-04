export const clampTableZoom=(value:number)=>Math.max(.5,Math.min(1.6,value));
export function touchDistance(touches:ArrayLike<{clientX:number;clientY:number}>){return touches.length===2?Math.hypot(touches[1].clientX-touches[0].clientX,touches[1].clientY-touches[0].clientY):0;}
// Native listeners must be non-passive to consume only the two-finger gesture.
export function bindTablePinch(element:HTMLElement,getZoom:()=>number,setZoom:(n:number)=>void){
 let startDistance=0,startZoom=1,frame=0,pending=1,suppressUntil=0;
 const flush=()=>{frame=0;setZoom(pending)};
 const stop=()=>{startDistance=0;if(frame){cancelAnimationFrame(frame);flush();}};
 const start=(e:TouchEvent)=>{if(e.touches.length!==2)return;startDistance=touchDistance(e.touches);startZoom=getZoom();suppressUntil=Date.now()+500;e.preventDefault();};
 const move=(e:TouchEvent)=>{if(e.touches.length!==2){stop();return;}if(!startDistance){start(e);return;}e.preventDefault();suppressUntil=Date.now()+500;pending=clampTableZoom(startZoom*touchDistance(e.touches)/startDistance);if(!frame)frame=requestAnimationFrame(flush);};
 const end=()=>{if(startDistance)suppressUntil=Date.now()+500;stop();};
 const gesture=(e:Event)=>e.preventDefault();
 const click=(e:MouseEvent)=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();}};
 element.addEventListener('touchstart',start,{passive:false});element.addEventListener('touchmove',move,{passive:false});element.addEventListener('touchend',end);element.addEventListener('touchcancel',end);
 element.addEventListener('gesturestart',gesture,{passive:false});element.addEventListener('gesturechange',gesture,{passive:false});element.addEventListener('click',click,true);
 return ()=>{if(frame)cancelAnimationFrame(frame);element.removeEventListener('touchstart',start);element.removeEventListener('touchmove',move);element.removeEventListener('touchend',end);element.removeEventListener('touchcancel',end);element.removeEventListener('gesturestart',gesture);element.removeEventListener('gesturechange',gesture);element.removeEventListener('click',click,true);};
}
