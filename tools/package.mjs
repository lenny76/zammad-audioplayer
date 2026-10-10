import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import assert from 'node:assert/strict';
const table=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=table[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
export async function buildPackage(root=fileURLToPath(new URL('../',import.meta.url))) {
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  const files=['manifest.json','background.js','settings.js','i18n.js','content.js','pcm-player.js','player.css','options.html','options.js','options.css','README.md','PRIVACY.md','LICENSE','_locales/en/messages.json','_locales/it/messages.json'];
  const chunks=[],central=[],originals=new Map();let offset=0;
  for(const name of files){
    const body=await fs.readFile(path.join(root,name));originals.set(name,body);
    const packed=deflateRawSync(body),filename=Buffer.from(name),crc=crc32(body);
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(8,6);local.writeUInt16LE(8,8);local.writeUInt16LE(0x21,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(filename.length,26);chunks.push(local,filename,packed);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt16LE(8,8);dir.writeUInt16LE(8,10);dir.writeUInt16LE(0x21,14);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(packed.length,20);dir.writeUInt32LE(body.length,24);dir.writeUInt16LE(filename.length,28);dir.writeUInt32LE(offset,42);central.push(dir,filename);offset+=local.length+filename.length+packed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  const archive=Buffer.concat([...chunks,directory,end]);
  let cursor=0,verified=0;
  while(archive.readUInt32LE(cursor)===0x04034b50){const size=archive.readUInt32LE(cursor+18),length=archive.readUInt16LE(cursor+26),name=archive.subarray(cursor+30,cursor+30+length).toString();const body=inflateRawSync(archive.subarray(cursor+30+length,cursor+30+length+size));assert.deepEqual(body,originals.get(name));assert.equal(crc32(body),archive.readUInt32LE(cursor+14));cursor+=30+length+size;verified++;}
  assert.equal(verified,files.length);assert.equal(cursor,offset);assert.equal(archive.readUInt32LE(archive.length-22),0x06054b50);
  await fs.mkdir(path.join(root,'dist'),{recursive:true});const target=path.join(root,'dist','zammad-audio-player-'+manifest.version+'.zip');await fs.writeFile(target,archive);return target;
}
if(typeof process!=='undefined'&&process.argv[1]&&import.meta.url===(await import('node:url')).pathToFileURL(process.argv[1]).href)console.log(await buildPackage());
