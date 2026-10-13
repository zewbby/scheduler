import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),svg=await readFile(new URL('public/avatars/notebook-yellow.svg',root),'utf8');
await writeFile(new URL('assets/app-icon.svg',root),svg);
await writeFile(new URL('public/favicon.svg',root),svg);
const edge='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',browser=await chromium.launch(existsSync(edge)?{executablePath:edge}:{});
try{
 const page=await browser.newPage({deviceScaleFactor:1}),sizes=[16,24,32,48,64,128,256],frames=[];
 for(const size of sizes){await page.setViewportSize({width:size,height:size});await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style>${svg}`);frames.push(await page.screenshot({omitBackground:true}));}
 await writeFile(new URL('assets/app-icon.png',root),frames.at(-1));
 const header=Buffer.alloc(6+sizes.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);let offset=header.length;
 sizes.forEach((size,index)=>{const entry=6+index*16;header.writeUInt8(size===256?0:size,entry);header.writeUInt8(size===256?0:size,entry+1);header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(frames[index].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=frames[index].length;});
 await writeFile(new URL('assets/app-icon.ico',root),Buffer.concat([header,...frames]));
 console.log(`Generated notebook SVG, PNG and multi-size Windows icon in ${fileURLToPath(new URL('assets',root))}`);
}finally{await browser.close();}
