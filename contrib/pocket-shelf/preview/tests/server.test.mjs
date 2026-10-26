// SPDX-License-Identifier: MPL-2.0
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('local server serves Three.js and a game catalogue without serving ROM bytes or paths',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pocket-shelf-http-'));
  await fs.writeFile(path.join(dir,'测试 Game.gba'),Buffer.alloc(512));
  const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const child=spawn(process.execPath,['server.mjs'],{cwd,env:{...process.env,POCKET_ROMS:dir,POCKET_PORT:'0'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();await fs.rm(dir,{recursive:true,force:true});});
  const base=await new Promise((resolve,reject)=>{
    const timeout=setTimeout(()=>reject(Error('server did not start')),5000);
    child.stdout.on('data',b=>{const match=b.toString().match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timeout);resolve(match[0]);}});
    child.once('error',reject);child.once('exit',code=>{if(code)reject(Error('server exited '+code));});
  });
  const response=await fetch(base+'/api/library'),catalog=await response.json();
  assert.equal(catalog.games.length,1);assert.equal(catalog.games[0].title,'测试 Game');
  assert.equal('path' in catalog.games[0],false);
  assert.equal((await fetch(base+'/vendor/three/build/three.module.js')).status,200);
  assert.equal((await fetch(base+'/server.mjs')).status,404);
  assert.equal((await fetch(base+'/api/library',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/测试%20Game.gba')).status,404);
});
