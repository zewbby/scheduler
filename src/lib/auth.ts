import { normalizedEndpoint, readConfig, setToken, syncRequest } from './sync';
import { loadData, saveData } from './storage';
export interface AccountRecord { version:1; username:string; iterations:number; salt:string; hash:string; }
declare const __LIUBAI_ACCOUNT_NAME__:string;
export function defaultUsername():string {try{return localStorage.getItem('liubai.lastUser')||(typeof __LIUBAI_ACCOUNT_NAME__==='undefined'?'':__LIUBAI_ACCOUNT_NAME__);}catch{return '';}}
let browserAccount:AccountRecord|null=null;
export async function cachedAccount():Promise<AccountRecord|null>{return window.daylightDesktop?.account?window.daylightDesktop.account.get():browserAccount;}
export async function createVerifier(username:string,password:string):Promise<AccountRecord>{const salt=crypto.getRandomValues(new Uint8Array(24)),iterations=100000;const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);return {version:1,username:username.trim(),iterations,salt:encode(salt),hash:encode(new Uint8Array(bits))};}
class CloudAuthError extends Error{constructor(message:string,public status:number){super(message);}}
function decode(value:string):Uint8Array<ArrayBuffer> { const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,x=>x.charCodeAt(0)); }
function encode(bytes:Uint8Array):string { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); }
export async function verifyAccount(record:AccountRecord,username:string,password:string):Promise<boolean>{
 if(password.length>1024||record.iterations<10000||record.iterations>100000)return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:decode(record.salt),iterations:record.iterations},key,256);
 const actual=encode(new Uint8Array(bits));let difference=actual.length^record.hash.length;
 for(let i=0;i<Math.max(actual.length,record.hash.length);i++)difference|=(actual.charCodeAt(i)||0)^(record.hash.charCodeAt(i)||0);
 return difference===0&&username.trim()===record.username;
}
export async function accountLogin(endpoint:string,username:string,password:string):Promise<string>{
 const response=await fetch(`${normalizedEndpoint(endpoint)}/api/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.trim(),password}),signal:AbortSignal.timeout(6000)});
 if(response.status===401)throw new CloudAuthError('账号或密码不正确。',401);
 if(response.status===429)throw new CloudAuthError('尝试次数较多，请 15 分钟后再登录。',429);
 if(response.status===404||response.status===503)throw new Error('云端账号还未配置，请先部署账号验证服务。');
 if(!response.ok)throw new Error(`云端登录暂时不可用（${response.status}）。`);
 const data=await response.json();if(typeof data.token!=='string'||!/^[^\s]{32,512}$/.test(data.token))throw new Error('云端返回了无效的登录信息。');return data.token;
}
export async function bootstrapCloudSession(username:string,password:string):Promise<string>{
 const {endpoint}=readConfig();let cached=await cachedAccount().catch(()=>null);
 try{
  if(!endpoint)throw new Error('离线模式');
  const token=await accountLogin(endpoint,username,password);await setToken(token);
  const record=await createVerifier(username,password);if(window.daylightDesktop?.account)await window.daylightDesktop.account.set(record);else browserAccount=record;cached=record;
  localStorage.setItem('liubai.lastUser',username.trim());
  const local=loadData();
  if(local.example){const response=await syncRequest(endpoint,token,0,[]);saveData({version:1,items:response.items,pending:[],cursor:response.cursor,example:false});}
  return '';
 }catch(error){if(error instanceof CloudAuthError)throw error;if(cached){if(await verifyAccount(cached,username,password))return '已离线登录，本机修改会在联网后同步。';throw new Error('账号或密码不正确。');}throw new Error('首次登录需要连接云端。请检查网络和账号后再试。');}
}
