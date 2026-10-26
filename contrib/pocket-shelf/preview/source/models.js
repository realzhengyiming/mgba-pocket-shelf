// SPDX-License-Identifier: MPL-2.0
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BODY,GAMEPAK,SLOT } from './hardware.js';

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
  const shell=mat('#66646b'),edge=mat('#3f3e46'),w=GAMEPAK.width,h=GAMEPAK.height,d=GAMEPAK.depth;
  // AGB-002: the 60 x 34.5 mm short, wide shell, with a slightly wider top stop.
  const shape=new THREE.Shape();shape.moveTo(-w/2+.04,-h/2);shape.lineTo(w/2-.04,-h/2);shape.quadraticCurveTo(w/2-.018,-h/2,w/2-.018,-h/2+.035);shape.lineTo(w/2-.018,h/2-.16);shape.lineTo(w/2,h/2-.16);shape.lineTo(w/2,h/2-.025);shape.quadraticCurveTo(w/2,h/2,w/2-.025,h/2);shape.lineTo(-w/2+.025,h/2);shape.quadraticCurveTo(-w/2,h/2,-w/2,h/2-.025);shape.lineTo(-w/2,h/2-.16);shape.lineTo(-w/2+.018,h/2-.16);shape.lineTo(-w/2+.018,-h/2+.035);shape.quadraticCurveTo(-w/2+.018,-h/2,-w/2+.04,-h/2);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:d-.024,bevelEnabled:true,bevelSegments:2,bevelSize:.012,bevelThickness:.012,curveSegments:10});geometry.center();geometry.computeBoundingBox();const size=new THREE.Vector3();geometry.boundingBox.getSize(size);geometry.scale(w/size.x,h/size.y,d/size.z);
  const body=new THREE.Mesh(geometry,shell);body.name='AGB002ShortShell';body.castShadow=true;body.receiveShadow=true;group.add(body);
  add(group,rounded(1.17,.615,.012,.034,edge),0,-.047,d/2+.004);
  const label=labelPlane(1.125,.575,cartLabel(game,theme));add(group,label,0,-.047,d/2+.012);group.userData.label=label;
  add(group,labelPlane(1.20,.085,textCanvas('GAME BOY ADVANCE',640,64,'#a5a1ab',31)),0,.338,d/2+.013);
  for(const side of[-1,1])add(group,rounded(.015,.46,.008,.003,edge),side*(w/2-.075),-.068,d/2+.004);
  // Pins are inside the bottom connector; the shell does not have front screws.
  add(group,rounded(1.30,.035,.095,.006,mat('#292930')),0,-h/2+.018,0);
  const gold=mat('#b99b58',{metalness:.55,roughness:.4});
  for(let i=0;i<32;i++)add(group,rounded(.019,.012,.068,.001,gold),-.635+i*.041,-h/2+.009,0);
  const back=labelPlane(1.13,.32,textCanvas('Nintendo   AGB-002',512,120,'#8e8b94',27));back.rotation.y=Math.PI;add(group,back,0,.09,-d/2-.007);
  const screw=add(group,disk(.027,.007,mat('#33333b')),0,-.27,-d/2-.003);screw.rotation.x=-Math.PI/2;
  group.traverse(o=>{if(o.isMesh)o.userData.gameIndex=index;});
  if(game.cover){const image=new Image();image.onload=()=>{label.material.map.dispose();label.material.map=texture(cartLabel(game,theme,image));label.material.needsUpdate=true;};image.src=game.cover;}
  return group;
}
export function makeShelf(){
  const group=new THREE.Group();group.name='CartridgeRack';
  add(group,rounded(5.4,.17,1.16,.12,mat('#d8d3bf')),0,-.36,.07);
  add(group,rounded(5.25,.06,1.05,.075,mat('#e8e4d4')),0,-.255,.06);
  add(group,rounded(5.08,.037,.12,.03,mat('#c4c5b0')),0,-.203,.46);
  for(const x of[-1.62,0,1.62])add(group,rounded(1.60,.024,.25,.025,mat('#bcc2ac')),x,-.212,.04);
  return group;
}
export const SHELLS={indigo:'#64549c',cream:'#e5e4df',sage:'#a1b09b'};
export function makeHandheld(){
  const group=new THREE.Group();group.name='GameBoyAdvance_AGB001';
  const shell=mat(SHELLS.indigo),back=mat('#50437d'),buttonMat=mat('#c6c8cd'),dark=mat('#24252c');
  const outline=()=>{const s=new THREE.Shape();s.moveTo(0,1);s.bezierCurveTo(-.49,1,-.93,.97,-1.23,.83);s.bezierCurveTo(-1.54,.79,-1.77,.82,-1.81,.61);s.bezierCurveTo(-1.87,.28,-1.87,-.40,-1.79,-.60);s.bezierCurveTo(-1.67,-.83,-.82,-1,0,-1);s.bezierCurveTo(.82,-1,1.67,-.83,1.79,-.60);s.bezierCurveTo(1.87,-.40,1.87,.28,1.81,.61);s.bezierCurveTo(1.77,.82,1.54,.79,1.23,.83);s.bezierCurveTo(.93,.97,.49,1,0,1);return s;};
  const bodyGeometry=new THREE.ExtrudeGeometry(outline(),{depth:BODY.depth-.16,bevelEnabled:true,bevelSegments:5,steps:1,bevelSize:.08,bevelThickness:.08,curveSegments:24});bodyGeometry.center();bodyGeometry.computeBoundingBox();const bounds=new THREE.Vector3();bodyGeometry.boundingBox.getSize(bounds);bodyGeometry.scale(BODY.width/bounds.x,BODY.height/bounds.y,BODY.depth/bounds.z);
  const body=add(group,new THREE.Mesh(bodyGeometry,back));body.name='AGB001Body';body.castShadow=true;body.receiveShadow=true;
  const faceGeometry=bodyGeometry.clone();faceGeometry.scale(.998,.998,.25);const face=add(group,new THREE.Mesh(faceGeometry,shell),0,.002,BODY.depth*.375+.003);face.name='AGB001FrontShell';face.castShadow=true;face.receiveShadow=true;
  const shoulder=mat('#b9bdc7');for(const side of[-1,1]){const k=add(group,rounded(.89,.18,.44,.075,shoulder),side*1.38,.854,-.026);k.rotation.z=-side*.13;}
  // Rear bay and guide rails. The short pak is flush with the top when seated.
  const slot=add(group,rounded(1.66,.95,.014,.036,mat('#2c2939')),0,.586,-BODY.depth/2-.004);slot.name='CartridgeSlot';
  const rail=mat('#6c5b9f');for(const side of[-1,1])add(group,rounded(.045,.89,.058,.018,rail),side*.815,.586,-BODY.depth/2-.021);
  add(group,rounded(1.67,.058,.095,.018,rail),0,.12,-BODY.depth/2-.027);
  add(group,rounded(1.64,.026,.10,.012,mat('#292635')),0,BODY.height/2-.014,SLOT.seated[2]);
  const battery=add(group,rounded(2.0,1.04,.04,.13,back),0,-.47,-BODY.depth/2-.012);battery.name='BatteryCover';
  for(let i=0;i<3;i++)add(group,rounded(.71,.018,.012,.007,rail),0,-.065-i*.043,-BODY.depth/2-.039);
  const rearText=labelPlane(1.46,.44,textCanvas('GAME BOY ADVANCE · AGB-001',900,180,'#a49ab9',34));rearText.rotation.y=Math.PI;add(group,rearText,0,-.49,-BODY.depth/2-.037);
  for(const side of[-1,1]){const screw=add(group,disk(.035,.008,mat('#33303e')),side*1.40,-.57,-BODY.depth/2-.014);screw.rotation.x=-Math.PI/2;}
  add(group,rounded(.36,.075,.15,.012,mat('#4a455b')),0,.996,.19);
  add(group,rounded(.28,.042,.11,.008,mat('#24232b')),0,1.016,.194);
  add(group,rounded(2.03,1.76,.042,.12,mat('#16171e')),0,.054,BODY.depth/2+.021);
  add(group,rounded(1.95,1.68,.021,.097,dark),0,.062,BODY.depth/2+.049);
  const screenCanvas=document.createElement('canvas');screenCanvas.width=480;screenCanvas.height=320;
  const screenTex=texture(screenCanvas);
  const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.603,1.069),new THREE.MeshBasicMaterial({map:screenTex}));add(group,screen,0,.13,BODY.depth/2+.063);screen.name='Display';
  add(group,labelPlane(1.63,.125,textCanvas('GAME BOY ADVANCE',800,65,'#d9d9df',36)),0,-.65,BODY.depth/2+.065);
  add(group,labelPlane(.55,.105,textCanvas('Nintendo',360,70,'#9f91bf',36)),0,.978,BODY.depth/2-.014);
  // D-pad assembly, distinct key surfaces and shallow center well.
  add(group,disk(.325,.016,mat('#51447f')),-1.365,.16,BODY.depth/2+.002);
  const dpad=new THREE.Group();dpad.name='DPad';group.add(dpad);dpad.position.set(-1.365,.16,BODY.depth/2+.025);
  add(dpad,rounded(.18,.60,.07,.023,buttonMat));add(dpad,rounded(.60,.18,.07,.023,buttonMat));
  add(dpad,disk(.073,.009,mat('#b1b5bc')),0,0,.04);
  for(const [x,y,letter]of[[1.50,.24,'A'],[1.19,.035,'B']]){
    add(group,disk(.17,.014,mat('#51447f')),x,y,BODY.depth/2+.003);add(group,disk(.142,.071,mat('#969ba6')),x,y,BODY.depth/2+.035);
    add(group,disk(.139,.035,buttonMat),x,y,BODY.depth/2+.072);add(group,labelPlane(.095,.11,textCanvas(letter,80,80,'#818690',48)),x,y,BODY.depth/2+.093);
  }
  for(const [y,word]of[[-.43,'START'],[-.65,'SELECT']]){add(group,disk(.064,.035,buttonMat),-1.16,y,BODY.depth/2+.015);add(group,labelPlane(.38,.085,textCanvas(word,200,42,'#b5a9d2',26)),-1.46,y,BODY.depth/2+.028);}
  const ledMat=new THREE.MeshBasicMaterial({color:'#66754b'});add(group,new THREE.Mesh(new THREE.SphereGeometry(.031,12,8),ledMat),1.32,.795,BODY.depth/2+.011);
  add(group,labelPlane(.37,.068,textCanvas('POWER',160,40,'#a498c4',23)),1.32,.695,BODY.depth/2+.025);
  for(let i=0;i<6;i++){const slit=add(group,rounded(.39,.021,.012,.009,mat('#403761')),1.34,-.43-i*.064,BODY.depth/2+.013);slit.rotation.z=.28;}
  add(group,rounded(.30,.07,.14,.018,mat('#494452')),-.83,-.977,.04);
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
