// SPDX-License-Identifier: MPL-2.0
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const plasticNoise=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),d=ctx.createImageData(128,128);let seed=7;for(let i=0;i<d.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=180+(seed>>>25);d.data[i]=d.data[i+1]=d.data[i+2]=v;d.data[i+3]=255;}ctx.putImageData(d,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(5,5);return t;})();
const mat=(color,extra={})=>new THREE.MeshPhysicalMaterial({color,roughness:.62,metalness:0,clearcoat:.1,clearcoatRoughness:.7,bumpMap:plasticNoise,bumpScale:.003,...extra});
function rounded(w,h,d,r,material){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,4,r),material);mesh.castShadow=true;mesh.receiveShadow=true;return mesh;}
function add(parent,mesh,x=0,y=0,z=0){mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
function disk(radius,depth,material){const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,depth,40),material);m.rotation.x=Math.PI/2;m.castShadow=true;return m;}
function texture(canvas){const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;}
function labelPlane(w,h,canvas){return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture(canvas),transparent:true,depthWrite:false}));}
function textCanvas(text,w=512,h=96,ink='#647154',size=34){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle=ink;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`500 ${size}px PocketSans, sans-serif`;ctx.fillText(text,w/2,h/2,w-15);return c;}
const themes=[{shell:'#6d9389',label:'#dcba72',dark:'#3c5f58'},{shell:'#9ca7bd',label:'#b7b2d4',dark:'#4f5c7d'},{shell:'#c4aa88',label:'#9aa87a',dark:'#6e654e'}];
function gameTheme(game,index){if(/apotris/i.test(game.title))return themes[1];if(/celeste/i.test(game.title))return themes[0];return themes[index%themes.length];}
function pixelPoster(ctx,game,theme){
  ctx.fillStyle=theme.dark;ctx.fillRect(0,0,512,512);
  if(/apotris/i.test(game.title)){
    ctx.fillStyle='#ced3d2';ctx.font='500 46px PocketSans';ctx.textAlign='center';ctx.fillText('APOTRIS',256,101);
    const colors=['#c6a270','#a4bca8','#adb0ce','#e0d5b0'];
    const blocks=[[2,3,0],[3,3,0],[4,3,0],[3,2,0],[6,1,1],[6,2,1],[6,3,1],[7,3,1],[1,6,2],[2,6,2],[3,6,2],[3,5,2],[5,6,3],[6,6,3],[6,5,3],[7,5,3]];
    for(const [x,y,i] of blocks){ctx.fillStyle=colors[i];ctx.fillRect(40+x*44,120+y*38,39,33);ctx.fillStyle='#ffffff44';ctx.fillRect(42+x*44,122+y*38,35,3);}
  }else if(/celeste/i.test(game.title)){
    ctx.fillStyle='#b9c8c5';ctx.fillRect(0,0,512,345);ctx.fillStyle='#edf0df';ctx.beginPath();ctx.moveTo(-70,360);ctx.lineTo(168,54);ctx.lineTo(379,360);ctx.fill();
    ctx.fillStyle='#98afa4';ctx.beginPath();ctx.moveTo(140,360);ctx.lineTo(330,107);ctx.lineTo(580,360);ctx.fill();
    ctx.fillStyle='#748c81';ctx.fillRect(0,328,512,80);ctx.fillStyle='#f4e8cf';ctx.font='500 52px PocketSans';ctx.textAlign='center';ctx.fillText('CELESTE',256,425);
    ctx.font='500 20px PocketSans';ctx.fillText('CLASSIC',256,459);
  }else{
    ctx.fillStyle='#d2cca8';ctx.beginPath();ctx.arc(256,167,88,0,Math.PI*2);ctx.fill();
    const trees=[[55,286,90],[125,248,114],[352,268,108],[440,284,96]];
    for(const [x,y,s]of trees){ctx.fillStyle='#8b9c6a';ctx.beginPath();ctx.moveTo(x-s*.44,y);ctx.lineTo(x,y-s);ctx.lineTo(x+s*.44,y);ctx.fill();ctx.fillStyle='#657751';ctx.fillRect(x-6,y,12,60);}
    ctx.fillStyle='#344a39';ctx.fillRect(0,330,512,182);ctx.font='500 53px PocketSans';ctx.textAlign='center';ctx.fillStyle='#efe3b7';ctx.fillText(game.title.replace(/\s[\d.]+$/,'').slice(0,15).toUpperCase(),256,416,455);
    ctx.font='500 15px PocketSans';ctx.fillStyle='#aeb991';ctx.fillText('A LITTLE ADVENTURE AWAITS',256,453);
  }
}
function cartLabel(game,theme,image){
  const c=document.createElement('canvas');c.width=512;c.height=400;const ctx=c.getContext('2d');
  ctx.fillStyle='#e7e1cb';ctx.fillRect(0,0,512,400);ctx.save();ctx.beginPath();ctx.roundRect(12,12,488,376,19);ctx.clip();
  if(image){const scale=Math.max(488/image.width,294/image.height);ctx.drawImage(image,256-image.width*scale/2,158-image.height*scale/2,image.width*scale,image.height*scale);}
  else{ctx.save();ctx.translate(0,-12);ctx.scale(1,.76);pixelPoster(ctx,game,theme);ctx.restore();}
  ctx.fillStyle='#ece5cf';ctx.fillRect(0,306,512,100);ctx.fillStyle=theme.dark;ctx.font='500 28px PocketSans,sans-serif';ctx.textAlign='left';ctx.fillText(game.title,31,350,445);
  ctx.fillStyle='#938d76';ctx.font='500 14px PocketSans,sans-serif';ctx.fillText('POCKET LIBRARY',32,376);ctx.textAlign='right';ctx.fillText(game.system||'GBA',478,376);ctx.restore();
  return c;
}
export function makeCartridge(game,index){
  const theme=gameTheme(game,index),group=new THREE.Group();group.name=`Cartridge_${index}`;group.userData.gameIndex=index;
  const caseMaterial=mat(theme.shell),edgeMaterial=mat(theme.dark);
  // A stepped outline, recessed label, screws, molded ribs and separate gold contacts.
  const shape=new THREE.Shape();shape.moveTo(-.63,-.65);shape.lineTo(.63,-.65);shape.quadraticCurveTo(.71,-.65,.71,-.57);shape.lineTo(.71,.42);shape.lineTo(.56,.42);shape.lineTo(.56,.56);shape.quadraticCurveTo(.56,.61,.51,.61);shape.lineTo(-.51,.61);shape.quadraticCurveTo(-.56,.61,-.56,.56);shape.lineTo(-.56,.42);shape.lineTo(-.71,.42);shape.lineTo(-.71,-.57);shape.quadraticCurveTo(-.71,-.65,-.63,-.65);
  const body=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.125,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.023,bevelThickness:.025,curveSegments:12}),caseMaterial);body.castShadow=true;body.receiveShadow=true;body.position.z=-.07;group.add(body);
  add(group,rounded(1.2,.86,.014,.055,edgeMaterial),0,-.02,.102);
  const label=labelPlane(1.14,.82,cartLabel(game,theme));add(group,label,0,-.02,.12);group.userData.label=label;
  add(group,labelPlane(.94,.11,textCanvas('POCKET  GAME',512,80,theme.dark,34)),0,.49,.118);
  for(let i=0;i<4;i++)for(const side of[-1,1])add(group,rounded(.061,.013,.013,.004,edgeMaterial),side*.655,.27-i*.05,.099);
  for(const x of[-.57,.57]){add(group,disk(.027,.008,mat('#87947c',{metalness:.35,roughness:.5})),x,-.51,.109);add(group,rounded(.033,.004,.005,.001,mat('#4f6653')),x,-.51,.116);}
  add(group,rounded(.49,.088,.04,.01,mat('#3d5545')),0,-.665,.008);
  for(let i=0;i<10;i++)add(group,rounded(.029,.08,.007,.002,mat('#c3a466',{metalness:.55,roughness:.35})),-.198+i*.044,-.666,.032);
  group.traverse(o=>{if(o.isMesh)o.userData.gameIndex=index;});
  if(game.cover){const image=new Image();image.onload=()=>{label.material.map.dispose();label.material.map=texture(cartLabel(game,theme,image));label.material.needsUpdate=true;};image.src=game.cover;}
  return group;
}
export function makeShelf(){
  const group=new THREE.Group();group.name='CartridgeRack';
  add(group,rounded(5.4,.17,1.16,.12,mat('#d8d3bf')),0,-.36,.07);
  add(group,rounded(5.25,.06,1.05,.075,mat('#e8e4d4')),0,-.255,.06);
  add(group,rounded(5.08,.037,.12,.03,mat('#c4c5b0')),0,-.203,.46);
  for(const x of[-1.76,0,1.76])add(group,rounded(1.48,.024,.19,.025,mat('#bcc2ac')),x,-.212,.04);
  return group;
}
export const SHELLS={sage:'#dce1cb',cream:'#eee5cf',indigo:'#8d91ab'};
export function makeHandheld(){
  const group=new THREE.Group();group.name='PocketAdvance';
  const shell=mat(SHELLS.sage),back=mat('#aeb79b'),buttonMat=mat('#d4b178'),dark=mat('#596a4c');
  const body=add(group,rounded(3.78,2.08,.41,.23,back),0,0,0);
  add(group,rounded(3.77,2.04,.28,.23,shell),0,.018,.09);
  add(group,rounded(3.53,.018,.013,.003,mat('#c3ccb1')),0,-.65,.24);
  const shoulder=mat('#bec9ae');add(group,rounded(.83,.17,.39,.055,shoulder),-1.33,.968,-.03);add(group,rounded(.83,.17,.39,.055,shoulder),1.33,.968,-.03);
  const slot=add(group,rounded(1.52,.033,.22,.016,mat('#47513e')),0,1.029,-.05);slot.name='CartridgeSlot';
  add(group,rounded(1.36,.037,.15,.018,mat('#223729')),0,1.044,-.055);
  add(group,rounded(2.13,1.56,.067,.12,mat('#aab89a')),0,.12,.257);
  add(group,rounded(2.035,1.45,.05,.105,mat('#586d4d')),0,.13,.292);
  add(group,rounded(1.92,1.34,.027,.075,dark),0,.15,.327);
  const screenCanvas=document.createElement('canvas');screenCanvas.width=480;screenCanvas.height=320;
  const screenTex=texture(screenCanvas);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.64,1.09),new THREE.MeshBasicMaterial({map:screenTex}));add(group,screen,0,.20,.346);screen.name='Display';
  add(group,labelPlane(1.66,.12,textCanvas('POCKET   ADVANCE',512,60,'#bcc8a9',26)),0,-.485,.349);
  // D-pad assembly, distinct key surfaces and shallow center well.
  add(group,disk(.37,.016,mat('#c4ccb5')),-1.405,.15,.25);
  const dpad=new THREE.Group();dpad.name='DPad';group.add(dpad);dpad.position.set(-1.405,.15,.282);
  add(dpad,rounded(.19,.58,.055,.035,mat('#415a43')));add(dpad,rounded(.58,.19,.055,.035,mat('#415a43')));
  add(dpad,disk(.073,.009,mat('#3c533d')),0,0,.032);
  for(const [x,y,letter]of[[1.48,.34,'A'],[1.23,-.03,'B']]){
    add(group,disk(.195,.014,mat('#bfc9ac')),x,y,.25);add(group,disk(.151,.071,mat('#b3915e')),x,y,.282);
    add(group,disk(.145,.035,buttonMat),x,y,.32);add(group,labelPlane(.135,.15,textCanvas(letter,80,80,'#7b623e',49)),x,y,.341);
  }
  for(const [x,word]of[[-.34,'SELECT'],[.16,'START']]){const k=add(group,rounded(.3,.065,.055,.031,mat('#a4b093')),x,-.81,.28);k.rotation.z=.13;add(group,labelPlane(.31,.07,textCanvas(word,120,36,'#849574',22)),x,-.92,.287);}
  const ledMat=new THREE.MeshBasicMaterial({color:'#8fa477'});const led=add(group,new THREE.Mesh(new THREE.SphereGeometry(.026,12,8),ledMat),1.15,.722,.282);
  add(group,labelPlane(.33,.065,textCanvas('POWER',160,40,'#899777',23)),1.39,.722,.276);
  for(let x=0;x<5;x++)for(let y=0;y<3;y++)add(group,disk(.012,.006,mat('#98a789')),1.07+x*.075,-.73-y*.06,.272);
  group.userData={shell,back,screenCanvas,screenTex,ledMat,slot,body};
  updateScreen(group,'off');return group;
}
export function updateScreen(group,mode,title='',progress=0){
  const {screenCanvas:canvas,screenTex,ledMat}=group.userData,ctx=canvas.getContext('2d');
  const lit=mode!=='off';ctx.fillStyle=lit?'#c5d5a3':'#314b37';ctx.fillRect(0,0,480,320);
  ctx.fillStyle=lit?'#758b5830':'#8293740a';for(let y=0;y<320;y+=4)ctx.fillRect(0,y,480,1);
  ctx.textAlign='center';
  if(mode==='off'){ctx.font='500 26px PocketSans';ctx.fillStyle='#9dab85';ctx.fillText('等一盘好游戏',240,147);ctx.font='500 12px PocketSans';ctx.fillStyle='#788d69';ctx.fillText('INSERT A CARTRIDGE',240,187);}
  else if(mode==='boot'){ctx.fillStyle='#536c3e';ctx.font='600 57px PocketSans';ctx.fillText('POCKET',240,141);ctx.font='500 17px PocketSans';ctx.fillText('A LITTLE ADVENTURE',240,186);ctx.fillStyle='#94aa73';ctx.fillRect(162,226,156,3);ctx.fillStyle='#536c3e';ctx.fillRect(162,226,156*progress,3);}
  else {ctx.fillStyle='#566e43';ctx.font='500 22px PocketSans';ctx.fillText('READY TO PLAY',240,98);ctx.font='500 30px PocketSans';ctx.fillText(title,240,166,428);ctx.font='500 14px PocketSans';ctx.fillText('交互预览完成',240,224);}
  screenTex.needsUpdate=true;ledMat.color.set(lit?'#a0bc5e':'#8fa477');
}
