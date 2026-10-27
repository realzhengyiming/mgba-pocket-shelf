// SPDX-License-Identifier: MPL-2.0
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { scanLibrary } from './source/library.mjs';
import { demoLibrary } from './source/demo-library.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = process.env.POCKET_ROMS || path.resolve(here, '../roms');
const port = Number(process.env.POCKET_PORT || 3764);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.json':'application/json', '.otf':'font/otf', '.svg':'image/svg+xml', '.wav':'audio/wav' };
const coverFiles = new Map();
const serveRoots = {
  '/vendor/three/': path.join(here, 'node_modules/three/'),
  '/assets/': path.resolve(here, '../assets/'),
  '/': here,
};
const server = http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405);res.end();return; }
    if (url.pathname === '/api/library') {
      const localGames=await scanLibrary(root, path.resolve(here,'../assets/covers'));
      const demo=localGames.length===0 && process.env.POCKET_DEMO!=='0';
      const games=demo ? demoLibrary() : localGames;
      coverFiles.clear();
      for (const g of games) { if(g.cover)coverFiles.set(g.id,g.cover); }
      res.writeHead(200, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify({games:games.map(({cover,path:romPath,...g})=>({...g,cover:cover?`/cover/${g.id}`:null})), rootLabel:'/roms', mode:demo?'demo':'preview'}));
      return;
    }
    let target;
    if (url.pathname.startsWith('/cover/')) target=coverFiles.get(url.pathname.slice(7));
    else {
      const mount = Object.keys(serveRoots).find(p=>url.pathname.startsWith(p));
      const base=path.resolve(serveRoots[mount]),relative=decodeURIComponent(url.pathname.slice(mount.length));
      target=path.resolve(base, relative || 'index.html');
      if(!target.startsWith(base + path.sep) && target!==path.join(base,'index.html')) {res.writeHead(403);res.end();return;}
      // Do not expose server source, credentials, ROM files, or arbitrary project files.
      if(!['.html','.js','.mjs','.css','.png','.jpg','.json','.otf','.svg','.wav'].includes(path.extname(target)))target=null;
      if(target?.endsWith('server.mjs')||target?.endsWith('package-lock.json'))target=null;
    }
    if(!target){res.writeHead(404);res.end();return;}
    const data=await fs.readFile(target);
    res.writeHead(200, {'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    res.end(req.method==='HEAD'?undefined:data);
  } catch(e) {res.writeHead(e.code==='ENOENT'?404:500);res.end('Unable to load this resource.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Pocket Shelf preview: http://127.0.0.1:${server.address().port}`));
