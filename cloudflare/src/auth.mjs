const WINDOW_MS=15*60*1000;
const MAX_ATTEMPTS=8;
function decode(value){return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),x=>x.charCodeAt(0));}
function encode(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function verifyPassword(record,password){
 if(!record||record.version!==1||typeof record.username!=='string'||!Number.isInteger(record.iterations)||record.iterations<10000||record.iterations>100000||!/^[-\w]{16,128}$/.test(record.salt)||!/^[-\w]{43}$/.test(record.hash))throw new Error('Invalid account configuration');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const result=encode(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(record.salt),iterations:record.iterations},key,256)));
 let difference=0;for(let i=0;i<record.hash.length;i++)difference|=result.charCodeAt(i)^record.hash.charCodeAt(i);return difference===0;
}
export async function login(request,env,body){
 let record;try{record=JSON.parse(env.ACCOUNT_PASSWORD_RECORD||'null');}catch{return {status:503,error:'not_configured'};}
 if(!record||!env.DB||typeof env.SYNC_TOKEN!=='string'||!/^[^\s]{32,512}$/.test(env.SYNC_TOKEN))return {status:503,error:'not_configured'};
 if(!body||typeof body.username!=='string'||body.username.length>128||typeof body.password!=='string'||!body.password||body.password.length>1024)return {status:400,error:'invalid_request'};
 const database=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
 const now=Date.now();const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 const key=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip))));
 const results=await database.batch([
  database.prepare('DELETE FROM login_attempts WHERE window_start < ?').bind(now-WINDOW_MS),
  database.prepare(`INSERT INTO login_attempts (key,window_start,attempts) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET attempts=login_attempts.attempts+1`).bind(key,now),
  database.prepare('SELECT attempts FROM login_attempts WHERE key = ?').bind(key),
 ]);
 if(results.some(result=>result.success===false))throw new Error('Authentication storage failure');
 if(results[2].results[0]?.attempts>MAX_ATTEMPTS)return {status:429,error:'too_many_attempts'};
 let valid;try{valid=await verifyPassword(record,body.password);}catch{return {status:503,error:'not_configured'};}
 if(!valid||body.username.trim()!==record.username)return {status:401,error:'unauthorized'};
 await database.batch([database.prepare('DELETE FROM login_attempts WHERE key = ?').bind(key)]);
 return {status:200,token:env.SYNC_TOKEN,username:record.username};
}
