// SPDX-License-Identifier: MPL-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {scanLibrary} from '../source/library.mjs';
import {insertPose,MOTION} from '../source/motion.js';

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
  const insertion=MOTION.pick+MOTION.align+MOTION.insert;
  assert.equal(insertPose(0).phase,'pick');assert.equal(insertPose(MOTION.pick+.02).phase,'align');
  assert.equal(insertPose(insertion+.01).phase,'boot');assert.equal(insertPose(insertion+.01).slide,1);
  assert.equal(insertPose(insertion+MOTION.boot+.01).phase,'ready');
  assert.deepEqual(insertPose(1.1,1),insertPose(2.2,2));
});
test('reduced motion skips the flight and finishes without flicker',()=>{assert.equal(insertPose(0,1,true).travel,1);assert.equal(insertPose(.21,1,true).phase,'ready');});
