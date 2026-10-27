// SPDX-License-Identifier: MPL-2.0
// Visual reconstruction from the linked hardware recording; not Nintendo BIOS execution.
export const BOOT_SECONDS=3.9;
export const LETTER_EDGES=[68,114,157,223,272,323,366,412];
const clamp=t=>Math.max(0,Math.min(1,t));
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
export function bootLetter(index,progress){
  const seconds=clamp(progress)*BOOT_SECONDS,u=clamp((seconds-.46-index*.085)/1.22);
  let y,scale;
  if(u<.25){const v=smooth(u/.25);y=240-395*v;scale=7.5-5*v;}
  else if(u<.55){const v=smooth((u-.25)/.3);y=-155*(1-v);scale=2.5-1.55*v;}
  else if(u<.72){const v=smooth((u-.55)/.17);y=-13*v;scale=.95+.05*v;}
  else {y=-13*(1-smooth((u-.72)/.28));scale=1;}
  const hue=((.87+index*.1+u*.6)%1)*360,settle=smooth((u-.55)/.45);
  return {u,y,scale,alpha:smooth(u/.08),hue,settle,center:(LETTER_EDGES[index]+LETTER_EDGES[index+1])/2,seconds};
}
export function bootShine(x,seconds){
  const wave=(seconds-2.38)/1.15;
  return wave>=0&&wave<=1?Math.max(0,1-Math.abs(x-(25+wave*440))/48):0;
}
