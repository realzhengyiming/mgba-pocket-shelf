// SPDX-License-Identifier: MPL-2.0
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { makeCartridge,makeShelf,makeHandheld,updateScreen,SHELLS } from './models.js';
import { MOTION,insertPose,clamp,smooth,easeOut } from './motion.js';

const el=id=>document.getElementById(id),stage=el('stage');
const ui={title:el('game-title'),meta:el('game-meta'),index:el('game-index'),status:el('device-status'),hint:el('device-hint'),insert:el('insert'),previous:el('previous'),next:el('next'),back:el('back'),refresh:el('refresh')};
const state={games:[],selected:0,scroll:0,mode:'browse',started:0,speed:1,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,sound:false,hover:-1,returnFrom:null,pickFrom:null,frame:0};
let renderer,scene,camera,machine,rack,carts=[],artifacts,cancelled=false,mobile=false,lastGamepadPress=0,padWasDown=false,padAxis=0,audio;
let dragging=null,sceneDisposed=false;
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),clock=new THREE.Clock();
const aligned=new THREE.Quaternion();
const pickStart=new THREE.Vector3(),pickRotation=new THREE.Quaternion();

function error(message){el('error').hidden=!message;el('error').textContent=message;}
function describe(){
  const game=state.games[state.selected],busy=state.mode!=='browse';
  if(!game){ui.title.textContent='卡带架还是空的';ui.meta.textContent='把 .gba / .gb / .gbc 放进 /roms，再重新扫描';ui.index.textContent='00 / 00';ui.insert.disabled=true;ui.previous.disabled=true;ui.next.disabled=true;return;}
  ui.title.textContent=game.title;
  ui.meta.textContent=`${game.system==='GBA'?'GAME BOY ADVANCE':game.system==='GBC'?'GAME BOY COLOR':'GAME BOY'}　·　${(game.bytes/1048576).toFixed(1)} MB　·　本地卡带`;
  ui.index.textContent=`${String(state.selected+1).padStart(2,'0')} / ${String(state.games.length).padStart(2,'0')}`;
  el('game-count').textContent=String(state.games.length).padStart(2,'0');
  ui.previous.disabled=busy||state.selected===0;ui.next.disabled=busy||state.selected===state.games.length-1;
  ui.refresh.disabled=busy;ui.insert.disabled=state.mode==='return';
  el('insert-label').textContent=state.mode==='play'?'拔出卡带':state.mode==='insert'?'正在插卡…':'插卡，开玩';
  el('back-label').textContent=state.mode==='browse'?'放回卡带':'拔出卡带';
  ui.insert.disabled ||= state.mode==='insert';
  el('status-dot').classList.toggle('is-on',state.mode==='play');
  if(state.mode==='browse'){
    ui.status.textContent='掌机正在等一张卡带';ui.hint.textContent='可以把卡带拖到掌机上，也可以按 A。';
  }else if(state.mode==='insert'){
    ui.status.textContent='把好时光，轻轻插回去。';ui.hint.textContent='按 B，可以把卡带放回去。';
  }else if(state.mode==='play'){
    ui.status.textContent='咔哒。好时光开机了。';ui.hint.textContent='交互预览完成；Switch 版将在这里交给 mGBA。';
  }else{ui.status.textContent='把卡带收好，下次继续。';ui.hint.textContent='';}
}
function select(index){
  if(state.mode!=='browse'||dragging)return;
  const next=clamp(index,0,state.games.length-1);if(next===state.selected)return;
  state.selected=next;ensureCarts();error('');describe();sound('select');
}
function ensureCarts(){
  // Keep only nearby physical models alive; a large ROM folder is still a small scene.
  for(let i=Math.max(0,state.selected-2);i<=Math.min(state.games.length-1,state.selected+2);i++){
    if(!carts[i]){carts[i]=makeCartridge(state.games[i],i);artifacts.add(carts[i]);}
  }
  for(let i=0;i<carts.length;i++)if(carts[i]&&Math.abs(i-state.selected)>3){artifacts.remove(carts[i]);disposeTree(carts[i]);carts[i]=undefined;}
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
  if(!state.games.length||state.mode==='insert'||state.mode==='return')return;
  if(state.mode==='play'){back();return;}
  const cart=carts[state.selected];if(!cart)return;
  state.mode='insert';state.started=performance.now()/1000;
  cart.getWorldPosition(pickStart);cart.getWorldQuaternion(pickRotation);
  state.pickFrom={position:pickStart.clone(),quaternion:pickRotation.clone(),scale:cart.scale.x};
  state.bootSound=false;state.clickSound=false;dragging=null;stage.classList.remove('is-dragging');describe();
}
function back(){
  if(state.mode==='browse')return;
  if(state.mode==='return')return;
  const cart=carts[state.selected];if(!cart)return;
  state.returnFrom={position:cart.position.clone(),quaternion:cart.quaternion.clone(),scale:cart.scale.x};
  state.mode='return';state.started=performance.now()/1000;updateScreen(machine,'off');describe();
}
function home(index){
  const d=index-state.scroll,focus=Math.max(0,1-Math.abs(d));
  if(mobile)return {position:new THREE.Vector3(d*1.16,.27+focus*.09,1.22+focus*.17),rotation:new THREE.Euler(-.13,-d*.09,-d*.035),scale:.73+focus*.08,visible:Math.abs(d)<1.85};
  return {position:new THREE.Vector3(-2.62+d*1.62,.43+focus*.1,.48+focus*.23),rotation:new THREE.Euler(-.09,-d*.13,-d*.035),scale:.93+focus*.16,visible:Math.abs(d)<1.82};
}
function arrange(){
  if(!camera)return;
  const width=stage.clientWidth,height=stage.clientHeight;mobile=width<650;
  renderer.setSize(width,height,false);
  const aspect=width/height,worldWidth=mobile?Math.max(6.3,4.1*aspect):Math.max(11.75,3.8*aspect),halfHeight=worldWidth/aspect/2;
  camera.left=-worldWidth/2;camera.right=worldWidth/2;camera.top=halfHeight;camera.bottom=-halfHeight;
  if(mobile){camera.position.set(2,6.8,12);camera.lookAt(0,.25,-.4);machine.position.set(.08,.45,-2);machine.rotation.set(-.14,-.03,-.03);machine.scale.setScalar(.74);rack.position.set(0,-.035,1.05);rack.scale.setScalar(.69);}
  else {camera.position.set(3.2,5.2,12);camera.lookAt(-.13,.58,0);machine.position.set(2.43,.68,-.17);machine.rotation.set(-.13,-.14,-.055);machine.scale.setScalar(1);rack.position.set(-2.62,0,.15);rack.scale.setScalar(1);}
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
function pointerDown(event){
  if(state.mode!=='browse')return;
  const h=hit(event);if(!h)return;
  const index=h.object.userData.gameIndex;
  if(index!==state.selected){select(index);return;}
  const cart=carts[index],normal=new THREE.Vector3();camera.getWorldDirection(normal);
  dragging={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false,cart,plane:new THREE.Plane().setFromNormalAndCoplanarPoint(normal,cart.position),offset:cart.position.clone().sub(h.point)};
  renderer.domElement.setPointerCapture(event.pointerId);
}
function pointerMove(event){
  if(!dragging){if(state.mode==='browse'){const h=hit(event);state.hover=h?.object.userData.gameIndex??-1;stage.classList.toggle('can-grab',!!h);}return;}
  if(!dragging.moved&&Math.hypot(event.clientX-dragging.x,event.clientY-dragging.y)<7)return;
  dragging.moved=true;stage.classList.add('is-dragging');
  hit(event);const point=raycaster.ray.intersectPlane(dragging.plane,new THREE.Vector3());
  if(point){dragging.cart.position.copy(point.add(dragging.offset));dragging.cart.rotation.z=clamp((event.clientX-dragging.x)*.0009,-.15,.15);}
  ui.status.textContent='把卡带移到掌机上方';ui.hint.textContent='松开，听一声咔哒。';
}
function pointerUp(event){
  if(!dragging)return;
  const drag=dragging;dragging=null;stage.classList.remove('is-dragging');
  if(!drag.moved){insert();return;}
  const target=machine.localToWorld(new THREE.Vector3(0,1.1,-.05));target.project(camera);
  const rect=renderer.domElement.getBoundingClientRect();const sx=rect.left+(target.x+1)*rect.width/2,sy=rect.top+(1-target.y)*rect.height/2;
  if(Math.hypot(event.clientX-sx,event.clientY-sy)<(mobile?110:170)){insert();}
  else {state.returnFrom={position:drag.cart.position.clone(),quaternion:drag.cart.quaternion.clone(),scale:drag.cart.scale.x};state.mode='return';state.started=performance.now()/1000;describe();}
}
function keyboard(event){
  if(/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
  if(/BUTTON|SUMMARY/.test(event.target.tagName)&&(event.key==='Enter'||event.key===' '))return;
  if(['ArrowLeft','ArrowRight','Enter',' ','Escape'].includes(event.key))event.preventDefault();
  if(event.key==='ArrowLeft')select(state.selected-1);
  if(event.key==='ArrowRight')select(state.selected+1);
  if((event.key==='Enter'||event.key===' ')&&!event.repeat)insert();
  if(event.key==='Escape'&&!event.repeat)back();
  if(event.key.toLowerCase()==='x'&&!event.repeat&&state.mode==='browse')loadGames();
}
function gamepad(now){
  if(!navigator.getGamepads)return;
  const p=Array.from(navigator.getGamepads()).find(Boolean);if(!p)return;
  const isNintendo=/nintendo|joy.?con|pro controller/i.test(p.id),a=p.buttons[isNintendo?1:0]?.pressed,b=p.buttons[isNintendo?0:1]?.pressed,x=p.buttons[isNintendo?3:2]?.pressed;
  const direction=p.buttons[14]?.pressed||p.axes[0]<-.55?-1:p.buttons[15]?.pressed||p.axes[0]>.55?1:0;
  if(direction&&(direction!==padAxis||now-lastGamepadPress>.25)){select(state.selected+direction);lastGamepadPress=now;}
  padAxis=direction;
  if(!padWasDown){if(a)insert();else if(b)back();else if(x&&state.mode==='browse')loadGames();}
  padWasDown=!!(a||b||x);
}
function animate(){
  if(cancelled)return;
  state.frame=requestAnimationFrame(animate);const dt=Math.min(.05,clock.getDelta()),now=performance.now()/1000;
  state.scroll+=(state.selected-state.scroll)*(1-Math.exp(-dt*11));
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
    scene.updateMatrixWorld(true);
    const above=machine.localToWorld(new THREE.Vector3(0,1.88,-.055));
    const inside=machine.localToWorld(new THREE.Vector3(0,.94,-.055));
    machine.getWorldQuaternion(aligned);
    if(pose.phase==='pick'){
      const t=pose.travel;cart.position.lerpVectors(start.position,above,t);cart.position.y+=Math.sin(t*Math.PI)*.48;
      cart.quaternion.copy(start.quaternion).slerp(aligned,t);cart.scale.setScalar(start.scale+(machine.scale.x*.89-start.scale)*t);
    }else {cart.position.lerpVectors(above,inside,pose.slide);cart.quaternion.copy(aligned);cart.scale.setScalar(machine.scale.x*.89);}
    if(pose.phase==='insert'&&pose.slide>.87&&!state.clickSound){sound('insert');state.clickSound=true;ui.status.textContent='咔哒。卡带就位。';}
    if(pose.phase==='boot'){
      if(!state.bootSound){sound('boot');state.bootSound=true;ui.status.textContent='掌机亮起来了。';}
      updateScreen(machine,'boot','',pose.boot);
    }
    if(pose.phase==='ready'){state.mode='play';updateScreen(machine,'play',state.games[state.selected].title);describe();}
  }else if(cart&&state.mode==='play'){
    // Keep the inserted card attached to the slot when the preview is resized.
    scene.updateMatrixWorld(true);
    cart.position.copy(machine.localToWorld(new THREE.Vector3(0,.94,-.055)));
    machine.getWorldQuaternion(cart.quaternion);cart.scale.setScalar(machine.scale.x*.89);
  }else if(cart&&state.mode==='return'){
    const duration=state.reduced ? .15 : MOTION.eject*state.speed,t=easeOut((now-state.started)/duration),homePose=home(state.selected),start=state.returnFrom;
    cart.position.lerpVectors(start.position,homePose.position,t);cart.position.y+=Math.sin(t*Math.PI)*.7;
    cart.quaternion.copy(start.quaternion).slerp(new THREE.Quaternion().setFromEuler(homePose.rotation),t);cart.scale.setScalar(start.scale+(homePose.scale-start.scale)*t);
    if(t>=1){state.mode='browse';state.returnFrom=null;describe();}
  }
  const zoomTarget=state.mode==='insert'?(mobile ? .93 : .88):1;
  camera.zoom+=(zoomTarget-camera.zoom)*(1-Math.exp(-dt*5));camera.updateProjectionMatrix();
  renderer.render(scene,camera);
}
function download(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function exportMotion(){
  scene.updateMatrixWorld(true);
  const data={
    version:1,units:'meters',coordinateSystem:'right-handed Y-up',layout:mobile?'mobile':'desktop',
    timing:MOTION,durationMultiplier:state.speed,
    easing:{pick:'cubic ease-out',insert:'smoothstep',return:'cubic ease-out'},
    flightLift:.48,returnLift:.7,
    camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),orthographic:{left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom}},
    handheld:{node:machine.name,position:machine.position.toArray(),quaternion:machine.quaternion.toArray(),scale:machine.scale.x},
    slotAbove:machine.localToWorld(new THREE.Vector3(0,1.88,-.055)).toArray(),
    slotSeated:machine.localToWorld(new THREE.Vector3(0,.94,-.055)).toArray(),
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
    const output=new THREE.Group();output.name='PocketShelfAssets';output.add(copyNode(rack),copyNode(machine));
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
  ui.previous.addEventListener('click',()=>select(state.selected-1));ui.next.addEventListener('click',()=>select(state.selected+1));ui.insert.addEventListener('click',insert);ui.back.addEventListener('click',back);ui.refresh.addEventListener('click',()=>{if(state.mode==='browse')loadGames();});
  document.addEventListener('keydown',keyboard);renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',()=>{if(dragging){const cart=dragging.cart;dragging=null;state.returnFrom={position:cart.position.clone(),quaternion:cart.quaternion.clone(),scale:cart.scale.x};state.mode='return';state.started=performance.now()/1000;describe();}});
  el('sound').addEventListener('click',()=>{state.sound=!state.sound;el('sound').setAttribute('aria-pressed',String(state.sound));el('sound').setAttribute('aria-label',state.sound?'关闭音效':'开启音效');el('sound').textContent=state.sound?'声音开':'声音关';if(state.sound)sound('select');});
  el('shell').addEventListener('change',e=>{machine.userData.shell.color.set(SHELLS[e.target.value]);machine.userData.back.color.set(SHELLS[e.target.value]).multiplyScalar(.81);});
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
