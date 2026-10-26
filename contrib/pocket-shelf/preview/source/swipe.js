// SPDX-License-Identifier: MPL-2.0
const bounded=(value,count)=>Math.max(0,Math.min(Math.max(0,count-1),value));
export function beginSwipe(x,y,time,scroll,pitch){
  return {x,y,lastX:x,lastY:y,lastTime:time,scroll,pitch:Math.max(1,pitch),velocity:0,axis:'pending'};
}
export function moveSwipe(gesture,x,y,time,count){
  const dx=x-gesture.x,dy=y-gesture.y,dt=time-gesture.lastTime;
  if(gesture.axis==='pending'&&Math.hypot(dx,dy)>=10)gesture.axis=Math.abs(dx)>=Math.abs(dy)*1.15?'horizontal':'vertical';
  if(gesture.axis==='horizontal'&&dt>0){
    const sample=Math.max(-8,Math.min(8,(gesture.lastX-x)/gesture.pitch/dt));
    gesture.velocity=dt>.2?0:gesture.velocity*.35+sample*.65;
  }
  gesture.lastX=x;gesture.lastY=y;gesture.lastTime=time;
  const scroll=bounded(gesture.scroll-dx/gesture.pitch,count);
  return {axis:gesture.axis,scroll,selected:Math.round(scroll)};
}
export function endSwipe(gesture,x,y,time,count,cancelled=false,reduced=false){
  if(Math.hypot(x-gesture.lastX,y-gesture.lastY)>.01)moveSwipe(gesture,x,y,time,count);
  const scroll=bounded(gesture.scroll-(x-gesture.x)/gesture.pitch,count);
  const velocity=time-gesture.lastTime>.08?0:gesture.velocity;
  const selected=Math.round(bounded(scroll+(!cancelled&&!reduced?velocity*.14:0),count));
  return {axis:gesture.axis,scroll,selected,tap:!cancelled&&gesture.axis==='pending'};
}
