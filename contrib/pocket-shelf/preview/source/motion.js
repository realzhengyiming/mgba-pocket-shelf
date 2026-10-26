// SPDX-License-Identifier: MPL-2.0
export const MOTION = Object.freeze({ pick:0.78, align:0.24, insert:0.52, boot:0.75, eject:0.65 });
export const clamp = (v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v));
export const smooth = v=>{const t=clamp(v);return t*t*(3-2*t);};
export const easeOut = v=>1-(1-clamp(v))**3;
export function insertPose(time,speed=1,reduced=false){
  if(reduced)return {phase:time<.2?'insert':'ready',travel:1,slide:1,boot:clamp(time/.2)};
  const t=time/Math.max(.2,speed),pick=MOTION.pick,align=pick+MOTION.align,insert=align+MOTION.insert;
  return {phase:t<pick?'pick':t<align?'align':t<insert?'insert':t<insert+MOTION.boot?'boot':'ready',travel:easeOut(t/pick),slide:smooth((t-align)/MOTION.insert),boot:clamp((t-insert)/MOTION.boot)};
}
