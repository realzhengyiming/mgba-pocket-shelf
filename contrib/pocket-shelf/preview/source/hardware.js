// SPDX-License-Identifier: MPL-2.0
// Physical references: Nintendo AGB-001 specifications and its original manual.
export const REFERENCE = Object.freeze({
  model:'Game Boy Advance AGB-001',
  bodyMm:{width:144.5,height:82,depth:24.5},
  cartridgeMm:{width:60,height:34.5},
  sources:[
    'https://www.nintendo.co.jp/n08/hardware/gba/index.html',
    'https://www.nintendo.com/en-gb/Hardware/Nintendo-History/Game-Boy-Advance/Game-Boy-Advance-627139.html',
    'https://www.nintendo.com/eu/media/downloads/support_1/game_boy_advance_4/GBA_Manual_UK_DE_FR.pdf'
  ]
});
const unit=3.78/REFERENCE.bodyMm.width;
export const BODY=Object.freeze({width:3.78,height:REFERENCE.bodyMm.height*unit,depth:REFERENCE.bodyMm.depth*unit});
export const GAMEPAK=Object.freeze({width:60*unit,height:34.5*unit,depth:8.5*unit});
// The short GBA pak sits flush in the back bay. Its label points away from the screen.
export const SLOT=Object.freeze({
  above:[0,BODY.height/2+GAMEPAK.height/2+.22,-BODY.depth/2+.070],
  seated:[0,BODY.height/2-GAMEPAK.height/2-.012,-BODY.depth/2+.070],
  labelRotationY:Math.PI
});
