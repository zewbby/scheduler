import { createInterface } from 'node:readline';
import { spawn } from 'node:child_process';
import { readdir,readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const reader=createInterface({input:process.stdin,terminal:false});
console.log('Ready for private QA credentials JSON on stdin (input is hidden).');
for await(const line of reader){
 let credential;try{credential=JSON.parse(line);if(typeof credential.password!=='string'||!credential.password)throw new Error();}catch{console.error('Invalid QA input.');process.exitCode=1;break;}
 if(process.stdin.isTTY)process.stdin.setRawMode(false);reader.close();process.stdin.pause();
 const account=JSON.parse(await readFile(path.join(root,'.local','account.json'),'utf8')),privateValues=[credential.password,account.hash,account.salt];
 const scan=async directory=>{for(const entry of await readdir(directory,{withFileTypes:true})){const location=path.join(directory,entry.name);if(entry.isDirectory())await scan(location);else{const bytes=await readFile(location);if(privateValues.some(value=>bytes.includes(Buffer.from(value))))throw new Error('Private credential material found in build output.');}}};
 try{await scan(path.join(root,'dist'));console.log('Build privacy check passed: no password, private hash or private salt in output.');
   const commands=[['node_modules/@playwright/test/cli.js','test',...(process.argv.includes('--account-only')?['tests/login-e2e.spec.ts','-g','personal account']:[])],['scripts/smoke-desktop.mjs'],['scripts/smoke-packaged.mjs'],['scripts/smoke-cloud.mjs']];
   for(const args of commands){const result=await new Promise(resolve=>{const cloud=args[0]==='scripts/smoke-cloud.mjs',child=spawn(process.execPath,args,{cwd:root,env:{...process.env,LIUBAI_TEST_USERNAME:account.username,LIUBAI_TEST_PASSWORD:credential.password},stdio:[cloud?'pipe':'ignore','pipe','pipe']});if(cloud)child.stdin.end(JSON.stringify({password:credential.password})+'\n');const output=chunk=>{let content=chunk.toString();for(const value of privateValues)content=content.replaceAll(value,'[redacted]');process.stdout.write(content);};child.stdout.on('data',output);child.stderr.on('data',output);child.on('exit',code=>resolve(code));});if(result!==0){process.exitCode=1;break;}}
 }catch(error){console.error(error instanceof Error?error.message:'QA failed.');process.exitCode=1;}
 break;
}
