// SPDX-License-Identifier: MPL-2.0
export const MOTION = Object.freeze({ pick:.95, align:.15, insert:.65, turn:.65, boot:.65, ejectTurn:.34, ejectLift:.26, eject:.65 });
export const clamp = (v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export const smooth = v=>{const t=clamp(v);return t*t*(3-2*t);};
export const easeOut = v=>1-(1-clamp(v))**3;
export function insertPose(time,speed=1,reduced=false){
  if(reduced)return {phase:time<.2?'insert':'ready',travel:1,slide:1,boot:clamp(time/.2),facing:0};
  const t=time/Math.max(.2,speed),pick=MOTION.pick,align=pick+MOTION.align,insert=align+MOTION.insert;
  const front=insert+MOTION.turn;
  return {phase:t<pick?'pick':t<align?'align':t<insert?'insert':t<front?'turn':t<front+MOTION.boot?'boot':'ready',travel:easeOut(t/pick),slide:smooth((t-align)/MOTION.insert),boot:clamp((t-front)/MOTION.boot),facing:t<insert?smooth(t/.65):1-smooth((t-insert)/MOTION.turn)};
}
export function ejectPose(time,speed=1,seated=true,reduced=false){
  const t=time/Math.max(.2,speed);
  if(reduced)return {phase:time<.15?'return':'ready',turn:1,lift:1,travel:clamp(time/.15)};
  const turn=seated?MOTION.ejectTurn:0,lift=seated?MOTION.ejectLift:0;
  return {phase:t<turn?'turn':t<turn+lift?'lift':t<turn+lift+MOTION.eject?'return':'ready',turn:smooth(t/Math.max(.001,turn)),lift:smooth((t-turn)/Math.max(.001,lift)),travel:easeOut((t-turn-lift)/MOTION.eject)};
}
