// SPDX-License-Identifier: MPL-2.0
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export async function scanLibrary(root, assets, depth=0) {
  if(depth>8)return [];
  let entries;
  try {entries=await fs.readdir(root,{withFileTypes:true});} catch(e){if(e.code==='ENOENT')return [];throw e;}
  const games=[];
  for(const e of entries){
    if(e.name.startsWith('.'))continue;
    const p=path.join(root,e.name);
    if(e.isDirectory()){
      if(!['covers','cache','artwork'].includes(e.name.toLowerCase()))games.push(...await scanLibrary(p,assets,depth+1));
      continue;
    }
    if(!e.isFile()||!/^\.(gba|gb|gbc|zip)$/i.test(path.extname(e.name)))continue;
    const stat=await fs.stat(p);
    if(stat.size<192||stat.size>64*1024*1024)continue;
    const title=path.basename(e.name,path.extname(e.name));
    let code='';
    if(/^\.(gba|agb)$/i.test(path.extname(e.name))){
      const file=await fs.open(p,'r');
      try {
        const h=Buffer.alloc(192);const {bytesRead}=await file.read(h,0,h.length,0);
        const valid=bytesRead===192&&h[0xB2]===0x96&&((h.subarray(0xA0,0xBE).reduce((sum,v)=>sum+v,0x19)&255)===0);
        if(valid&&/^[A-Z0-9]{4}$/.test(h.toString('ascii',0xAC,0xB0)))code=h.toString('ascii',0xAC,0xB0);
      } finally {await file.close();}
    }
    let cover=null;
    for(const dir of [root,path.join(root,'covers'),assets]){
      if(!dir)continue;
      for(const ext of ['.png','.jpg','.jpeg','.PNG','.JPG']){
        const candidate=path.join(dir,title+ext);
        try {if((await fs.stat(candidate)).isFile()){cover=candidate;break;}} catch{}
      }
      if(cover)break;
    }
    if(!cover&&code){
      const candidate=path.join(root,'covers',code+'.png');
      try {if((await fs.lstat(candidate)).isFile())cover=candidate;}catch{}
    }
    games.push({code,id:createHash('sha256').update(p).digest('hex').slice(0,16),path:p,filename:e.name,title,system:path.extname(e.name).toLowerCase()==='.gb'?'GB':path.extname(e.name).toLowerCase()==='.gbc'?'GBC':'GBA',bytes:stat.size,cover});
  }
  return games.sort((a,b)=>a.title.localeCompare(b.title,'zh-CN')||a.path.localeCompare(b.path));
}
