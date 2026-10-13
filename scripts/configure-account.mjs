import { createInterface } from 'node:readline';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const reader=createInterface({input:process.stdin,terminal:false});
console.log('Ready for one JSON line on stdin: username and password (input is not logged).');
for await(const line of reader){
 try{
  const {username,password}=JSON.parse(line);
  if(typeof username!=='string'||!username.trim()||username.length>128||typeof password!=='string'||password.length<8||password.length>1024)throw new Error('Use a non-empty account and a password of 8–1024 characters.');
  const salt=randomBytes(24);const record={version:1,username:username.trim(),iterations:100000,salt:salt.toString('base64url'),hash:pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64url')};
  await mkdir(path.join(root,'.local'),{recursive:true});await writeFile(path.join(root,'.local','account.json'),JSON.stringify(record,null,2),{encoding:'utf8',mode:0o600});
  console.log('Account configured. Only a random salt and PBKDF2 verifier were saved.');
 }catch{console.error('Account configuration failed. No credentials were logged.');process.exitCode=1;}
 if(process.stdin.isTTY)process.stdin.setRawMode(false);reader.close();process.stdin.pause();break;
}
