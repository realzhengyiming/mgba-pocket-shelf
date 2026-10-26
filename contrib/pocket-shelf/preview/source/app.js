// SPDX-License-Identifier: MPL-2.0
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { makeCartridge,makeShelf,makeHandheld,updateScreen,SHELLS } from './models.js';
import { MOTION,insertPose,ejectPose,clamp,smooth } from './motion.js';
import { REFERENCE,SLOT } from './hardware.js';
import { beginSwipe,moveSwipe,endSwipe } from './swipe.js';

const el=id=>document.getElementById(id),stage=el('stage');
const ui={title:el('game-title'),meta:el('game-meta'),index:el('game-index'),status:el('device-status'),hint:el('device-hint'),insert:el('insert'),previous:el('previous'),next:el('next'),back:el('back'),refresh:el('refresh')};
const state={games:[],selected:0,scroll:0,mode:'browse',started:0,speed:1,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,sound:false,hover:-1,returnFrom:null,pickFrom:null,frame:0,facing:0,cardSlide:0,inspectBack:false,posePhase:null};
let renderer,scene,camera,machine,rack,carts=[],artifacts,cancelled=false,mobile=false,lastGamepadPress=0,padWasDown=false,padAxis=0,audio;
let dragging=null,shelfPointer=null,sceneDisposed=false;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),clock=new THREE.Clock();
const aligned=new THREE.Quaternion();
const pickStart=new THREE.Vector3(),pickRotation=new THREE.Quaternion();
const turnY=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI);
function faceMachine(facing){
  state.facing=facing;
  machine.quaternion.copy(machine.userData.restQuaternion).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI*facing));
  scene.updateMatrixWorld(true);
}
function slotPosition(which){return machine.localToWorld(new THREE.Vector3(...SLOT[which]));}
function rearAbove(){
  const rotation=machine.userData.restQuaternion.clone().multiply(turnY);
  return new THREE.Vector3(...SLOT.above).multiply(machine.scale).applyQuaternion(rotation).add(machine.position);
}
function captureReturn(cart,seated=false){
  scene.updateMatrixWorld(true);
  const rotation=machine.getWorldQuaternion(new THREE.Quaternion());
  return {position:cart.position.clone(),quaternion:cart.quaternion.clone(),scale:cart.scale.x,facing:state.facing,seated,localPosition:machine.worldToLocal(cart.position.clone()),localQuaternion:rotation.invert().multiply(cart.quaternion)};
}

function error(message){el('error').hidden=!message;el('error').textContent=message;}
function describe(){
  const game=state.games[state.selected],busy=state.mode!=='browse'||!!shelfPointer;
  if(!game){ui.title.textContent='卡带架还是空的';ui.meta.textContent='把 .gba / .gb / .gbc 放进 /roms，再重新扫描';ui.index.textContent='00 / 00';ui.insert.disabled=true;ui.previous.disabled=true;ui.next.disabled=true;return;}
  ui.title.textContent=game.title;
  ui.meta.textContent=`${game.system==='GBA'?'GAME BOY ADVANCE':game.system==='GBC'?'GAME BOY COLOR':'GAME BOY'}　·　${(game.bytes/1048576).toFixed(1)} MB　·　本地卡带`;
  ui.index.textContent=`${String(state.selected+1).padStart(2,'0')} / ${String(state.games.length).padStart(2,'0')}`;
  el('game-count').textContent=String(state.games.length).padStart(2,'0');
  ui.previous.disabled=busy||state.selected===0;ui.next.disabled=busy||state.selected===state.games.length-1;
  ui.refresh.disabled=busy;ui.insert.disabled=state.mode==='return'||!!shelfPointer;
  el('view-back').disabled=state.mode==='insert'||state.mode==='return';
  el('insert-label').textContent=state.mode==='play'?'拔出卡带':state.mode==='insert'?'正在插卡…':'插卡，开玩';
  el('back-label').textContent=state.mode==='browse'?'放回卡带':'拔出卡带';
  ui.insert.disabled ||= state.mode==='insert';
  el('status-dot').classList.toggle('is-on',state.mode==='play');
  if(state.mode==='browse'){
    ui.status.textContent='掌机正在等一张卡带';ui.hint.textContent='在架子上左右滑动选卡；向上拖卡或按 A 插入。';
  }else if(state.mode==='insert'){
    ui.status.textContent='把好时光，轻轻插回去。';ui.hint.textContent='按 B，可以把卡带放回去。';
  }else if(state.mode==='play'){
    ui.status.textContent='咔哒。好时光开机了。';ui.hint.textContent='按 B 放回卡带后，可继续左右滑动选卡。';
  }else{ui.status.textContent='把卡带收好，下次继续。';ui.hint.textContent='';}
}
function select(index){
  if(state.mode!=='browse'||dragging||shelfPointer)return;
  const next=clamp(index,0,state.games.length-1);if(next===state.selected)return;
  state.selected=next;ensureCarts();error('');describe();sound('select');
}
function ensureCarts(){
  // Include both the finger position and snap target, even on a long fling.
  const keep=new Set();
  for(const center of[state.selected,Math.round(state.scroll)])for(let i=Math.max(0,center-2);i<=Math.min(state.games.length-1,center+2);i++)keep.add(i);
  for(const i of keep)if(!carts[i]){carts[i]=makeCartridge(state.games[i],i);artifacts.add(carts[i]);}
  for(let i=0;i<carts.length;i++)if(carts[i]&&!keep.has(i)){artifacts.remove(carts[i]);disposeTree(carts[i]);carts[i]=undefined;}
}
function sound(type){
  if(!state.sound)return;
  try{
    audio ||= new (window.AudioContext||window.webkitAudioContext)();audio.resume();
    const now=audio.currentTime;
    const note=(freq,start,length,gain=.06)=>{const o=audio.createOscillator(),g=audio.createGain();o.type='sine';o.frequency.setValueAtTime(freq,now+start);g.gain.setValueAtTime(0,now+start);g.gain.linearRampToValueAtTime(gain,now+start+.006);g.gain.exponentialRampToValueAtTime(.001,now+start+length);o.connect(g).connect(audio.destination);o.start(now+start);o.stop(now+start+length+.01);};
    if(type==='select')note(460,0,.055,.025);
    if(type==='insert'){note(180,0,.055,.08);note(95,.035,.08,.045);}
    if(type==='boot'){note(660,0,.16,.035);note(990,.12,.3,.03);}
  }catch{}
}
function insert(){
  if(!state.games.length||state.mode==='insert'||state.mode==='return'||shelfPointer)return;
  if(state.mode==='play'){back();return;}
  const cart=carts[state.selected];if(!cart)return;
  state.mode='insert';state.started=performance.now()/1000;
  cart.getWorldPosition(pickStart);cart.getWorldQuaternion(pickRotation);
  state.pickFrom={position:pickStart.clone(),quaternion:pickRotation.clone(),scale:cart.scale.x};
  state.bootSound=false;state.clickSound=false;state.posePhase=null;state.cardSlide=0;state.inspectBack=false;el('view-back').textContent='查看背面';el('view-back').setAttribute('aria-pressed','false');dragging=null;stage.classList.remove('is-dragging');describe();
}
function back(){
  if(state.mode==='browse')return;
  if(state.mode==='return')return;
  const cart=carts[state.selected];if(!cart)return;
  state.returnFrom=captureReturn(cart,state.mode==='play'||state.cardSlide>.02);
  state.mode='return';state.started=performance.now()/1000;updateScreen(machine,'off');describe();
}
function home(index){
  const d=index-state.scroll,focus=Math.max(0,1-Math.abs(d));
  if(mobile)return {position:new THREE.Vector3(d*1.16,.13+focus*.03,1.22+focus*.17),rotation:new THREE.Euler(-.13,-d*.09,-d*.035),scale:.70+focus*.04,visible:Math.abs(d)<1.85};
  return {position:new THREE.Vector3(-2.62+d*1.62,.25+focus*.045,.48+focus*.23),rotation:new THREE.Euler(-.09,-d*.13,-d*.035),scale:.94+focus*.06,visible:Math.abs(d)<1.82};
}
function arrange(){
  if(!camera)return;
  if(shelfPointer)cancelPointer();
  const width=stage.clientWidth,height=stage.clientHeight;mobile=width<650;
  renderer.setSize(width,height,false);
  const aspect=width/height,worldWidth=mobile?Math.max(6.3,4.1*aspect):Math.max(11.75,3.8*aspect),halfHeight=worldWidth/aspect/2;
  camera.left=-worldWidth/2;camera.right=worldWidth/2;camera.top=halfHeight;camera.bottom=-halfHeight;
  if(mobile){camera.position.set(2,6.8,12);camera.lookAt(0,.25,-.4);machine.position.set(.08,.45,-2);machine.rotation.set(-.14,-.03,-.03);machine.scale.setScalar(.74);rack.position.set(0,-.035,1.05);rack.scale.setScalar(.69);}
  else {camera.position.set(3.2,5.2,12);camera.lookAt(-.13,.58,0);machine.position.set(2.43,.68,-.17);machine.rotation.set(-.13,-.14,-.055);machine.scale.setScalar(1);rack.position.set(-2.62,0,.15);rack.scale.setScalar(1);}
  machine.userData.restQuaternion=machine.quaternion.clone();faceMachine(state.facing);
  camera.updateProjectionMatrix();scene.updateMatrixWorld(true);
}
function disposeTree(group){
  const geometries=new Set(),materials=new Set(),textures=new Set();
  group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of o.material?Array.isArray(o.material)?o.material:[o.material]:[]){materials.add(m);if(m.map)textures.add(m.map);}});
  for(const x of geometries)x.dispose();for(const x of textures)x.dispose();for(const x of materials)x.dispose();
}
async function loadGames(){
  ui.refresh.disabled=true;error('');
  const previous=state.games[state.selected]?.id;
  try{
    const response=await fetch('/api/library');if(!response.ok)throw Error('library');
    const data=await response.json();state.games=data.games;
    for(const cart of carts)if(cart){artifacts.remove(cart);disposeTree(cart);}
    carts=new Array(state.games.length);
    const found=state.games.findIndex(g=>g.id===previous);state.selected=found>=0?found:Math.min(1,Math.max(0,state.games.length-1));state.scroll=state.selected;
    ensureCarts();state.mode='browse';updateScreen(machine,'off');describe();
    el('loading').hidden=true;el('loading').style.display='none';
    el('game-count').textContent=String(state.games.length).padStart(2,'0');
    el('preview-note').textContent=data.mode==='demo'?'示例卡带 · 未附带游戏 ROM，也不会启动模拟器':'本地游戏交互预览，暂不启动模拟器';
  }catch{error('卡带列表没读出来，请确认本地预览服务还在运行，再按 X 重试。');}
  finally {ui.refresh.disabled=false;}
}
function hit(event){
  const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  return raycaster.intersectObjects(carts.filter(Boolean),true).find(h=>h.object.userData.gameIndex!==undefined&&carts[h.object.userData.gameIndex].visible);
}
function cardPitch(){
  const a=home(state.selected).position.clone(),b=a.clone();b.x+=mobile?1.16:1.62;
  a.project(camera);b.project(camera);
  return Math.max(36,Math.abs(b.x-a.x)*renderer.domElement.getBoundingClientRect().width/2);
}
function pointerDown(event){
  if(state.mode!=='browse'||shelfPointer||!state.games.length||(event.pointerType==='mouse'&&event.button!==0))return;
  const h=hit(event);if(!h&&!raycaster.intersectObject(rack,true).length)return;
  const index=h?.object.userData.gameIndex??-1;
  shelfPointer={id:event.pointerId,index,swipe:beginSwipe(event.clientX,event.clientY,event.timeStamp/1000,state.scroll,cardPitch()),hit:h};
  renderer.domElement.setPointerCapture(event.pointerId);describe();
}
function showSwipe(index){
  if(index!==state.selected){state.selected=index;error('');describe();sound('select');}
  ensureCarts();
}
function pointerMove(event){
  const p=shelfPointer;
  if(!p){if(state.mode==='browse'){const h=hit(event);state.hover=h?.object.userData.gameIndex??-1;stage.classList.toggle('can-grab',!!h);}return;}
  if(event.pointerId!==p.id)return;
  const move=moveSwipe(p.swipe,event.clientX,event.clientY,event.timeStamp/1000,state.games.length);
  if(move.axis==='horizontal'){
    state.scroll=move.scroll;showSwipe(move.selected);stage.classList.add('is-swiping');
    ui.status.textContent='左右滑动，挑一盘喜欢的';ui.hint.textContent='松手自动对齐；按 A 或轻点选中的卡带插入。';
  }else if(move.axis==='vertical'&&p.hit&&p.index===state.selected){
    if(!dragging){const cart=carts[p.index],normal=new THREE.Vector3();camera.getWorldDirection(normal);dragging={id:p.id,x:p.swipe.x,y:p.swipe.y,moved:true,cart,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,cart.position),offset:cart.position.clone().sub(p.hit.point)};}
    stage.classList.add('is-dragging');hit(event);const point=raycaster.ray.intersectPlane(dragging.plane,new THREE.Vector3());
    if(point){dragging.cart.position.copy(point.add(dragging.offset));dragging.cart.rotation.z=clamp((event.clientX-dragging.x)*.0009,-.15,.15);}
    ui.status.textContent='把卡带移到掌机上方';ui.hint.textContent='松开，听一声咔哒。';
  }
}
function finishPointer(event,cancelled=false){
  const p=shelfPointer;if(!p||event.pointerId!==p.id)return;
  const drag=dragging;dragging=null;shelfPointer=null;
  const result=endSwipe(p.swipe,event.clientX,event.clientY,event.timeStamp/1000,state.games.length,cancelled,state.reduced);
  stage.classList.remove('is-dragging','is-swiping','can-grab');state.hover=-1;
  if(renderer.domElement.hasPointerCapture(p.id))renderer.domElement.releasePointerCapture(p.id);
  if(result.axis==='horizontal'){state.scroll=result.scroll;showSwipe(result.selected);describe();return;}
  if(drag){
    const target=slotPosition('seated');target.project(camera);
    const rect=renderer.domElement.getBoundingClientRect(),sx=rect.left+(target.x+1)*rect.width/2,sy=rect.top+(1-target.y)*rect.height/2;
    if(!cancelled&&Math.hypot(event.clientX-sx,event.clientY-sy)<(mobile?110:170))insert();
    else{state.returnFrom=captureReturn(drag.cart);state.mode='return';state.started=performance.now()/1000;describe();}
  }else if(result.tap&&p.index>=0){if(p.index!==state.selected)select(p.index);else insert();}
  else describe();
}
function pointerUp(event){finishPointer(event);}
function cancelPointer(event){
  if(!shelfPointer||(event?.pointerId!==undefined&&event.pointerId!==shelfPointer.id))return;
  const p=shelfPointer;
  finishPointer({pointerId:p.id,clientX:p.swipe.lastX,clientY:p.swipe.lastY,timeStamp:performance.now()},true);
}
function keyboard(event){
  if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(/BUTTON|SUMMARY/.test(event.target.tagName)&&(event.key==='Enter'||event.key===' '))return;
  if(['ArrowLeft','ArrowRight','Enter',' ','Escape'].includes(event.key))event.preventDefault();
  if(event.key==='ArrowLeft')select(state.selected-1);
  if(event.key==='ArrowRight')select(state.selected+1);
  if((event.key==='Enter'||event.key===' ')&&!event.repeat)insert();
  if(event.key==='Escape'&&!event.repeat)back();
  if(event.key.toLowerCase()==='x'&&!event.repeat&&state.mode==='browse'&&!shelfPointer)loadGames();
}
function gamepad(now){
  if(!navigator.getGamepads)return;
  const p=Array.from(navigator.getGamepads()).find(Boolean);if(!p)return;
  const isNintendo=/nintendo|joy.?con|pro controller/i.test(p.id),a=p.buttons[isNintendo?1:0]?.pressed,b=p.buttons[isNintendo?0:1]?.pressed,x=p.buttons[isNintendo?3:2]?.pressed;
  const direction=p.buttons[14]?.pressed||p.axes[0]<-.55?-1:p.buttons[15]?.pressed||p.axes[0]>.55?1:0;
  if(direction&&(direction!==padAxis||now-lastGamepadPress>.25)){select(state.selected+direction);lastGamepadPress=now;}
  padAxis=direction;
  if(!padWasDown){if(a)insert();else if(b)back();else if(x&&state.mode==='browse'&&!shelfPointer)loadGames();}
  padWasDown=!!(a||b||x);
}
function animate(){
  if(cancelled)return;
  state.frame=requestAnimationFrame(animate);const dt=Math.min(.05,clock.getDelta()),now=performance.now()/1000;
  if(!shelfPointer)state.scroll+=(state.selected-state.scroll)*(1-Math.exp(-dt*11));
  if(state.mode==='browse')ensureCarts();
  gamepad(now);
  for(let i=0;i<carts.length;i++){
    const cart=carts[i];if(!cart)continue;
    const h=home(i),active=i===state.selected;
    if(active&&(state.mode!=='browse'||dragging))continue;
    cart.visible=h.visible;cart.position.copy(h.position);cart.rotation.copy(h.rotation);cart.scale.setScalar(h.scale);
    if(state.hover===i&&!active)cart.position.y+=.045;
  }
  const cart=carts[state.selected];
  if(cart&&state.mode==='insert'){
    const pose=insertPose(now-state.started,state.speed,state.reduced),start=state.pickFrom;
    faceMachine(pose.facing);state.cardSlide=pose.slide;
    const above=slotPosition('above'),inside=slotPosition('seated');
    machine.getWorldQuaternion(aligned);aligned.multiply(turnY);
    if(pose.phase==='pick'){
      const t=pose.travel;cart.position.lerpVectors(start.position,above,t);cart.position.y+=Math.sin(t*Math.PI)*.48;
      cart.quaternion.copy(start.quaternion).slerp(aligned,t);cart.scale.setScalar(start.scale+(machine.scale.x-start.scale)*t);
    }else {cart.position.lerpVectors(above,inside,pose.slide);cart.quaternion.copy(aligned);cart.scale.setScalar(machine.scale.x);}
    if(state.posePhase!==pose.phase){
      state.posePhase=pose.phase;
      if(pose.phase==='pick')ui.status.textContent='翻到背面，找到 GBA 卡槽。';
      if(pose.phase==='insert')ui.status.textContent='沿着背面的导轨，轻轻推到底。';
      if(pose.phase==='turn')ui.status.textContent='短卡带已插好，转回正面。';
    }
    if(pose.phase==='insert'&&pose.slide>.87&&!state.clickSound){sound('insert');state.clickSound=true;ui.status.textContent='咔哒。卡带就位。';}
    if(pose.phase==='boot'){
      if(!state.bootSound){sound('boot');state.bootSound=true;ui.status.textContent='掌机亮起来了。';}
      updateScreen(machine,'boot','',pose.boot);
    }
    if(pose.phase==='ready'){state.mode='play';updateScreen(machine,'play',state.games[state.selected].title);describe();}
  }else if(cart&&state.mode==='play'){
    // Keep the inserted card attached to the slot when the preview is resized.
    faceMachine(state.facing+((state.inspectBack?1:0)-state.facing)*(1-Math.exp(-dt*7)));
    cart.position.copy(slotPosition('seated'));
    machine.getWorldQuaternion(cart.quaternion);cart.quaternion.multiply(turnY);cart.scale.setScalar(machine.scale.x);
  }else if(cart&&state.mode==='return'){
    const homePose=home(state.selected),start=state.returnFrom,pose=ejectPose(now-state.started,state.speed,start.seated,state.reduced),t=pose.travel,targetFacing=state.inspectBack?1:0;
    if(start.seated&&(pose.phase==='turn'||pose.phase==='lift')){
      faceMachine(start.facing+(1-start.facing)*pose.turn);
      cart.position.copy(machine.localToWorld(start.localPosition.clone().lerp(new THREE.Vector3(...SLOT.above),pose.lift)));
      machine.getWorldQuaternion(cart.quaternion);cart.quaternion.multiply(start.localQuaternion);cart.scale.setScalar(machine.scale.x);
    }else{
      faceMachine(start.seated?1+(targetFacing-1)*smooth(t):start.facing+(targetFacing-start.facing)*smooth(t));
      const from=start.seated?rearAbove():start.position;
      const rotation=start.seated?machine.userData.restQuaternion.clone().multiply(turnY).multiply(turnY):start.quaternion;
      cart.position.lerpVectors(from,homePose.position,t);cart.position.y+=Math.sin(t*Math.PI)*.7;
      cart.quaternion.copy(rotation).slerp(new THREE.Quaternion().setFromEuler(homePose.rotation),t);cart.scale.setScalar(start.scale+(homePose.scale-start.scale)*t);
    }
    if(pose.phase==='ready'){state.mode='browse';state.returnFrom=null;state.cardSlide=0;describe();}
  }else {faceMachine(state.facing+((state.inspectBack?1:0)-state.facing)*(1-Math.exp(-dt*7)));}
  const zoomTarget=state.mode==='insert'?(mobile ? .93 : .88):1;
  camera.zoom+=(zoomTarget-camera.zoom)*(1-Math.exp(-dt*5));camera.updateProjectionMatrix();
  renderer.render(scene,camera);
}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportMotion(){
  scene.updateMatrixWorld(true);
  const restMatrix=new THREE.Matrix4().compose(machine.position,machine.userData.restQuaternion,machine.scale);
  const data={
    version:2,units:'scene units',millimetersPerSceneUnit:144.5/3.78,reference:REFERENCE,coordinateSystem:'right-handed Y-up',layout:mobile?'mobile':'desktop',
    timing:MOTION,durationMultiplier:state.speed,
    easing:{pick:'cubic ease-out',insert:'smoothstep',return:'cubic ease-out'},
    flightLift:.48,returnLift:.7,
    camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),orthographic:{left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom}},
    handheld:{node:machine.name,position:machine.position.toArray(),quaternion:machine.userData.restQuaternion.toArray(),scale:machine.scale.x},
    slotAbove:new THREE.Vector3(...SLOT.above).applyMatrix4(restMatrix).toArray(),
    slotSeated:new THREE.Vector3(...SLOT.seated).applyMatrix4(restMatrix).toArray(),labelRotationY:SLOT.labelRotationY,
    cartridges:carts.flatMap((cart,i)=>{if(!cart)return [];const h=home(i);return [{node:cart.name,position:h.position.toArray(),rotation:h.rotation.toArray().slice(0,3),scale:h.scale,visible:h.visible}];}),
    states:['browse','insert','play','return'],
    emulator:{path:'sdmc:/switch/mgba/mgba.nro',argument:'absolute ROM path',previewLaunchesEmulator:false}
  };
  download(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'pocket-shelf-motion.json');
}
async function exportModels(){
  const button=el('export-model');button.disabled=true;button.textContent='正在导出…';
  try{
    // Clone geometry without live UI references in userData. Export resting card poses.
    function copyNode(node){
      const copy=node.isMesh?new THREE.Mesh(node.geometry,node.material):new THREE.Group();
      copy.name=node.name;copy.position.copy(node.position);copy.quaternion.copy(node.quaternion);copy.scale.copy(node.scale);copy.visible=node.visible;
      if(node.userData.gameIndex!==undefined)copy.userData={gameIndex:node.userData.gameIndex};
      for(const child of node.children)copy.add(copyNode(child));
      return copy;
    }
    const output=new THREE.Group();output.name='PocketShelfAssets';output.userData={hardware:REFERENCE.model,referenceMillimeters:REFERENCE.bodyMm,millimetersPerSceneUnit:144.5/3.78};
    const handheld=copyNode(machine);handheld.quaternion.copy(machine.userData.restQuaternion);output.add(copyNode(rack),handheld);
    for(let i=0;i<carts.length;i++){
      if(!carts[i])continue;const pose=home(i);if(!pose.visible)continue;
      const copy=copyNode(carts[i]);copy.visible=true;copy.position.copy(pose.position);copy.rotation.copy(pose.rotation);copy.scale.setScalar(pose.scale);output.add(copy);
    }
    const exporter=new GLTFExporter();
    const binary=await exporter.parseAsync(output,{binary:true,maxTextureSize:1024,onlyVisible:false});
    download(new Blob([binary],{type:'model/gltf-binary'}),'pocket-shelf.glb');button.textContent='模型已导出';
  }catch(e){error('模型导出失败，请刷新后重试。');button.textContent='导出模型 GLB';console.error(e);}
  finally{button.disabled=false;}
}
async function setup(){
  await document.fonts.load('16px PocketSans');
  renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
  renderer.setClearColor(0xf3f0e7,0);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;
  stage.appendChild(renderer.domElement);
  scene=new THREE.Scene();scene.environmentIntensity=.65;
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  camera=new THREE.OrthographicCamera(-6,6,3,-3,.1,100);
  const sun=new THREE.DirectionalLight(0xfff9e7,2.1);sun.position.set(-3,8,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=6;sun.shadow.camera.bottom=-6;sun.shadow.normalBias=.025;sun.shadow.bias=-.00015;sun.shadow.radius=4;sun.shadow.blurSamples=8;scene.add(sun);scene.add(new THREE.HemisphereLight(0xfffbed,0xd4d8b9,.6));
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshBasicMaterial({color:0xf3f0e7,toneMapped:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-.45;scene.add(floor);
  const shadows=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.18}));shadows.rotation.x=-Math.PI/2;shadows.position.y=-.449;shadows.receiveShadow=true;scene.add(shadows);
  artifacts=new THREE.Group();artifacts.name='PocketShelfAssets';scene.add(artifacts);
  rack=makeShelf();machine=makeHandheld();artifacts.add(rack,machine);arrange();
  await loadGames();
  ui.previous.addEventListener('click',()=>select(state.selected-1));ui.next.addEventListener('click',()=>select(state.selected+1));ui.insert.addEventListener('click',insert);ui.back.addEventListener('click',back);ui.refresh.addEventListener('click',()=>{if(state.mode==='browse'&&!shelfPointer)loadGames();});
  window.addEventListener('blur',()=>cancelPointer());document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelPointer();});
  document.addEventListener('keydown',keyboard);renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',cancelPointer);renderer.domElement.addEventListener('lostpointercapture',cancelPointer);
  el('sound').addEventListener('click',()=>{state.sound=!state.sound;el('sound').setAttribute('aria-pressed',String(state.sound));el('sound').setAttribute('aria-label',state.sound?'关闭音效':'开启音效');el('sound').textContent=state.sound?'声音开':'声音关';if(state.sound)sound('select');});
  el('shell').addEventListener('change',e=>{machine.userData.shell.color.set(SHELLS[e.target.value]);machine.userData.back.color.set(SHELLS[e.target.value]).multiplyScalar(.81);});
  el('view-back').addEventListener('click',()=>{if(state.mode!=='browse'&&state.mode!=='play')return;state.inspectBack=!state.inspectBack;el('view-back').setAttribute('aria-pressed',String(state.inspectBack));el('view-back').textContent=state.inspectBack?'查看正面':'查看背面';});
  el('speed').addEventListener('input',e=>{state.speed=Number(e.target.value);el('speed-value').textContent=`${state.speed}×`;});
  el('reduce-motion').checked=state.reduced;el('reduce-motion').addEventListener('change',e=>state.reduced=e.target.checked);
  el('export-model').addEventListener('click',exportModels);
  el('export-motion').addEventListener('click',exportMotion);
  new ResizeObserver(arrange).observe(stage);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();cancelled=true;cancelAnimationFrame(state.frame);error('三维画面暂时中断了，刷新页面即可重新摆好卡带。');});
  animate();
}
setup().catch(e=>{el('loading').style.display='none';error('三维预览没有启动，请在支持 WebGL 2 的浏览器中打开。');console.error(e);});
window.addEventListener('pagehide',()=>{cancelled=true;cancelAnimationFrame(state.frame);if(renderer&&!sceneDisposed){sceneDisposed=true;renderer.dispose();}audio?.close();});
