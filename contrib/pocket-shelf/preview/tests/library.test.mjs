// SPDX-License-Identifier: MPL-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanLibrary} from '../source/library.mjs';
import {insertPose,ejectPose,MOTION} from '../source/motion.js';

test('scan recursive libraries, preserve Chinese filenames, find covers, skip saves and symlinks',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-shelf-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.mkdir(path.join(dir,'GBA/covers'),{recursive:true});
  const rom=Buffer.alloc(1024);
  await fs.writeFile(path.join(dir,'GBA/中文 游戏.GBA'),rom);
  await fs.writeFile(path.join(dir,'GBA/中文 游戏.sav'),rom);
  await fs.writeFile(path.join(dir,'GBA/unfinished.gba.uploading'),rom);
  await fs.writeFile(path.join(dir,'GBA/covers/中文 游戏.png'),Buffer.from('cover'));
  await fs.writeFile(path.join(dir,'.hidden.gba'),rom);
  await fs.symlink(path.join(dir,'GBA'),path.join(dir,'duplicate'));
  const games=await scanLibrary(dir,null);
  assert.equal(games.length,1);
  assert.equal(games[0].title,'中文 游戏');
  assert.equal(games[0].system,'GBA');
  assert.equal(games[0].cover,path.join(dir,'GBA/covers/中文 游戏.png'));
});
test('same basenames in different directories retain separate identities',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-shelf-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  for(const sub of ['a','b']){await fs.mkdir(path.join(dir,sub));await fs.writeFile(path.join(dir,sub,'Game.gba'),Buffer.alloc(256));}
  const games=await scanLibrary(dir,null);assert.equal(games.length,2);assert.notEqual(games[0].id,games[1].id);
});
test('missing and empty libraries stay empty',async()=>{assert.deepEqual(await scanLibrary('/nonexistent-pocket-library',null),[]);});
test('insertion reaches the seated position before booting, with repeatable timing',()=>{
  const insertion=MOTION.center+MOTION.pick+MOTION.align+MOTION.insert;
  assert.equal(insertPose(0).phase,'center');assert.equal(insertPose(MOTION.center+.02).phase,'pick');assert.equal(insertPose(MOTION.center+MOTION.pick+.02).phase,'align');
  assert.equal(insertPose(insertion+.01).phase,'turn');assert.equal(insertPose(insertion+.01).slide,1);
  const boot=insertPose(insertion+MOTION.turn+.01);assert.equal(boot.phase,'boot');assert.equal(boot.facing,0);
  assert.equal(insertPose(insertion+MOTION.turn+MOTION.boot+MOTION.fade+.01).phase,'ready');
  assert.deepEqual(insertPose(1.1,1),insertPose(2.2,2));
});
test('reduced motion skips the flight and finishes without flicker',()=>{assert.equal(insertPose(0,1,true).travel,1);assert.equal(insertPose(.21,1,true).phase,'ready');});
test('the handheld faces backward while the pak enters, and forward only after it is seated',()=>{
  const begin=MOTION.center+MOTION.pick+MOTION.align,end=begin+MOTION.insert;
  for(let t=begin;t<end;t+=.03){const p=insertPose(t);assert.equal(p.facing,1);assert.ok(p.slide>=0&&p.slide<=1);}
  const before=insertPose(end-.0001),after=insertPose(end+.0001);
  assert.ok(Math.abs(before.facing-after.facing)<.0001);assert.ok(Math.abs(before.slide-after.slide)<.0001);
});
test('a seated cartridge is exposed and lifted out before it returns to the shelf',()=>{
  assert.equal(ejectPose(.1).phase,'turn');assert.equal(ejectPose(.1).travel,0);
  assert.equal(ejectPose(MOTION.ejectTurn+.1).phase,'lift');assert.equal(ejectPose(MOTION.ejectTurn+.1).travel,0);
  assert.equal(ejectPose(MOTION.ejectTurn+MOTION.ejectLift+.1).phase,'return');
  assert.equal(ejectPose(2.1).phase,'ready');assert.equal(ejectPose(.1,1,false).phase,'return');
});

test('centering precedes picking, logo holds before fade, and only then hands off',()=>{
  assert.equal(insertPose(.4).travel,0);
  const logo=insertPose(5.7);assert.equal(logo.phase,'boot');assert.equal(logo.presentation,1);assert.equal(logo.focus,1);assert.equal(logo.fade,0);
  const fadeStart=MOTION.center+MOTION.pick+MOTION.align+MOTION.insert+MOTION.turn+MOTION.boot;
  assert.equal(insertPose(fadeStart+.1).phase,'fade');assert.ok(insertPose(fadeStart+.1).fade>0);
  assert.equal(insertPose(fadeStart+MOTION.fade+.01).phase,'ready');
});
test('GBA header code matches a cached cover, while a per-ROM image takes precedence',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-codes-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  await fs.mkdir(path.join(dir,'covers'));await fs.writeFile(path.join(dir,'covers/BPEE.png'),'cover');
  const rom=Buffer.alloc(256);rom.write('BPEE',0xAC);rom[0xB2]=0x96;
  rom[0xBD]=(-0x19-rom.subarray(0xA0,0xBD).reduce((a,b)=>a+b,0))&255;
  await fs.writeFile(path.join(dir,'translation.gba'),rom);
  let [game]=await scanLibrary(dir);assert.equal(game.code,'BPEE');assert.equal(game.cover,path.join(dir,'covers/BPEE.png'));
  await fs.writeFile(path.join(dir,'translation.png'),'override');
  [game]=await scanLibrary(dir);assert.equal(game.cover,path.join(dir,'translation.png'));
  rom[0xBD]^=1;await fs.writeFile(path.join(dir,'translation.gba'),rom);
  [game]=await scanLibrary(dir);assert.equal(game.code,'');
});

test('reference boot letters settle exactly before the final hold',async()=>{
  const {bootLetter,bootShine}=await import('../source/boot.js');
  for(let i=0;i<7;i++){
    assert.equal(bootLetter(i,0).alpha,0);
    const final=bootLetter(i,1);assert.ok(Math.abs(final.y)<1e-6);assert.equal(final.scale,1);assert.equal(final.settle,1);
    assert.equal(bootShine(final.center,final.seconds),0);
  }
});
