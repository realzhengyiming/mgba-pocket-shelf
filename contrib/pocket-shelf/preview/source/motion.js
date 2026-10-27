// SPDX-License-Identifier: MPL-2.0
import {BOOT_SECONDS} from './boot.js';
export const MOTION = Object.freeze({ center:.55, pick:.85, align:.15, insert:.65, turn:.65, boot:BOOT_SECONDS, fade:.25, ejectTurn:.55, ejectLift:.4, eject:1.05 });
export const clamp = (v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export const smooth = v=>{const t=clamp(v);return t*t*(3-2*t);};
export const easeOut = v=>1-(1-clamp(v))**3;
export function insertPose(time,speed=1,reduced=false){
  if(reduced)return {phase:time<.2?'insert':'ready',travel:1,slide:1,boot:1,facing:0,presentation:1,focus:1,fade:0};
  const t=time/Math.max(.2,speed),center=MOTION.center,pick=center+MOTION.pick,align=pick+MOTION.align,insert=align+MOTION.insert;
  const front=insert+MOTION.turn,bootEnd=front+MOTION.boot;
  return {phase:t<center?'center':t<pick?'pick':t<align?'align':t<insert?'insert':t<front?'turn':t<bootEnd?'boot':t<bootEnd+MOTION.fade?'fade':'ready',travel:easeOut((t-center)/MOTION.pick),slide:smooth((t-align)/MOTION.insert),boot:clamp((t-front)/MOTION.boot),facing:t<insert?smooth((t-center)/.7):1-smooth((t-insert)/MOTION.turn),presentation:smooth(t/center),focus:smooth((t-insert)/MOTION.turn),fade:smooth((t-bootEnd)/MOTION.fade)};
}

export function ejectPose(time,speed=1,seated=true,reduced=false){
  const t=time/Math.max(.2,speed);
  if(reduced)return {phase:time<.15?'return':'ready',turn:1,lift:1,travel:clamp(time/.15)};
  const turn=seated?MOTION.ejectTurn:0,lift=seated?MOTION.ejectLift:0;
  return {phase:t<turn?'turn':t<turn+lift?'lift':t<turn+lift+MOTION.eject?'return':'ready',turn:smooth(t/Math.max(.001,turn)),lift:smooth((t-turn)/Math.max(.001,lift)),travel:(v=>v*v*v*(v*(v*6-15)+10))(clamp((t-turn-lift)/MOTION.eject))};
}
