import {createInterface} from 'node:readline';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const deployment=JSON.parse(await readFile(path.join(root,'cloudflare','deployment.json'),'utf8'));
const account=JSON.parse(await readFile(path.join(root,'.local','account.json'),'utf8'));
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const reader=createInterface({input:process.stdin,terminal:false});
console.log('Ready for cloud verification credentials JSON on stdin (input is hidden).');
for await(const line of reader){
 let password;try{password=JSON.parse(line).password;if(typeof password!=='string'||!password)throw new Error();}catch{console.error('Invalid verification input.');process.exitCode=1;break;}
 if(process.stdin.isTTY)process.stdin.setRawMode(false);reader.close();process.stdin.pause();
 const id=`qa-${randomUUID()}`;let created=false;
 try{
  const response=await fetch(`${deployment.endpoint}/api/login`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'null'},body:JSON.stringify({username:account.username,password}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,'Cloud account login must succeed.');const {token}=await response.json();assert.equal(typeof token,'string');
  const sync=async(since,items)=>{const result=await fetch(`${deployment.endpoint}/api/sync`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`,Origin:'null'},body:JSON.stringify({since,items}),signal:AbortSignal.timeout(15000)});assert.equal(result.status,200,'Cloud sync must succeed.');return result.json();};
  const item={id,title:'独立线上同步验证',date:'2000-01-01',startTime:'',endTime:'',category:'work',notes:'Only this generated QA record is removed after verification.',completed:false,updatedAt:Date.now(),deleted:false};
  item.createdAt=item.updatedAt;created=true;const saved=await sync(0,[item]);assert.equal(saved.items.find(x=>x.id===id)?.title,item.title);const received=await sync(0,[]);assert.equal(received.items.find(x=>x.id===id)?.updatedAt,item.updatedAt);
  const changed={...item,title:'线上同步已验证',updatedAt:Date.now()+1};const edited=await sync(saved.cursor,[changed]);assert.equal(edited.items.find(x=>x.id===id)?.title,changed.title);
  const deletion={...changed,deleted:true,updatedAt:Date.now()+2};const deleted=await sync(edited.cursor,[deletion]);assert.equal(deleted.items.find(x=>x.id===id)?.deleted,true);const stale=await sync(deleted.cursor,[item]);assert.equal(stale.items.find(x=>x.id===id)?.deleted,true);
  console.log('Live Cloudflare passed: account login, authenticated create, second-device pull, edit, delete, and stale-device protection.');
 }catch(error){console.error(error instanceof Error?error.message:'Cloud verification failed.');process.exitCode=1;
 }finally{
  if(created){const cli=path.join(root,'.tools','cloudflare','node_modules','wrangler','bin','wrangler.js');
   if(!/^qa-[a-f0-9-]{36}$/.test(id))throw new Error('Invalid QA cleanup ID.');
   const exit=await new Promise(resolve=>{const child=spawn(process.execPath,[cli,'d1','execute',deployment.database,'--remote','--config',path.join(root,'cloudflare','wrangler.jsonc'),'--command',`DELETE FROM planner_items WHERE id = '${id}'`],{cwd:root,stdio:'ignore'});child.on('exit',resolve);});
   if(exit!==0){console.error(`QA cleanup did not complete for record ${id}.`);process.exitCode=1;}else console.log('Only the generated QA record was removed from the cloud database.');
  }
 }
 break;
}
