import { validItem, type PlannerItem } from './model';
import type {AccountRecord} from './auth';
export interface SyncConfig { endpoint:string; }
export interface SyncResponse { items:PlannerItem[]; cursor:number; full:boolean; serverTime:number; }
declare const __LIUBAI_SYNC_DEFAULT__:string;
export function defaultEndpoint():string{return typeof __LIUBAI_SYNC_DEFAULT__==='undefined'?'':__LIUBAI_SYNC_DEFAULT__;}
declare global { interface Window { daylightDesktop?: { platform:string; account:{get:()=>Promise<AccountRecord|null>;set:(record:AccountRecord)=>Promise<void>}; credentials:{get:()=>Promise<string|null>;set:(token:string)=>Promise<void>;clear:()=>Promise<void>}; }; } }
export function readConfig():SyncConfig {
  try {
    const raw=localStorage.getItem('liubai.sync');
    if(!raw)return {endpoint:defaultEndpoint()};
    const saved:unknown=JSON.parse(raw);
    if(!saved || typeof saved!=='object' || !('endpoint' in saved) || typeof saved.endpoint!=='string' || !saved.endpoint)return {endpoint:''};
    return {endpoint:normalizedEndpoint(saved.endpoint)};
  } catch { return {endpoint:''}; }
}
export function normalizedEndpoint(input:string):string {
  const url=new URL(input.trim());
  if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))throw new Error('请使用 HTTPS 地址，本机调试可使用 HTTP。');
  if(url.username || url.password || url.search || url.hash || (url.pathname!=='/' && url.pathname!==''))throw new Error('请填写 Worker 根地址，不需要路径或参数。');
  return url.origin;
}
let memoryToken='';
export async function getToken():Promise<string>{return window.daylightDesktop ? (await window.daylightDesktop.credentials.get()||'') : memoryToken;}
export async function setToken(token:string):Promise<void>{if(window.daylightDesktop)await window.daylightDesktop.credentials.set(token);else memoryToken=token;}
export async function clearToken():Promise<void>{if(window.daylightDesktop)await window.daylightDesktop.credentials.clear();memoryToken='';}
const MAX_SYNC_BYTES=2*1024*1024;
const encoder=new TextEncoder();
// Count the exact UTF-8 request body, since Chinese notes and emoji use multiple bytes.
export function selectSyncBatch(items:PlannerItem[],pending:string[],since:number):PlannerItem[]{
  const wanted=new Set(pending);const result:PlannerItem[]=[];
  let bytes=encoder.encode(JSON.stringify({since,items:[]})).byteLength;
  for(const item of items){
    if(!wanted.has(item.id))continue;
    const addition=encoder.encode(JSON.stringify(item)).byteLength+(result.length?1:0);
    if(bytes+addition>MAX_SYNC_BYTES){
      if(!result.length)throw new Error('有一条日程超过同步大小限制，请缩短随手记后重试。');
      break;
    }
    result.push(item);bytes+=addition;
    if(result.length===250)break;
  }
  if(pending.length&&!result.length)throw new Error('待同步记录与本机数据不一致，请先导出备份。');
  return result;
}
export async function syncRequest(endpoint:string,token:string,since:number,items:PlannerItem[]):Promise<SyncResponse>{
  const body=JSON.stringify({since,items});
  if(items.length>250||encoder.encode(body).byteLength>MAX_SYNC_BYTES)throw new Error('单次同步数据过多，请分批同步。');
  const response=await fetch(`${normalizedEndpoint(endpoint)}/api/sync`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body,signal:AbortSignal.timeout(20000)});
  if(!response.ok){
    if(response.status===401)throw new Error('同步凭据已失效，请在设置中重新连接账号。');
    if(response.status===403)throw new Error('此应用来源尚未放行，请检查 Cloudflare 的来源设置。');
    if(response.status===400){const error=await response.json().catch(()=>null);throw new Error(`日程未通过同步校验${typeof error?.error?.message==='string'?`：${error.error.message}`:'，请检查日期、时间与随手记。'}`);}
    throw new Error(`同步服务暂时不可用（${response.status}）`);
  }
  const data=await response.json();
  if(!data||!Array.isArray(data.items)||!data.items.every(validItem)||!Number.isSafeInteger(data.cursor)||data.cursor<0||typeof data.full!=='boolean'||!Number.isSafeInteger(data.serverTime)||data.serverTime<=0)throw new Error('同步服务返回了无效数据。');
  const returnedIds=new Set(data.items.map((item:PlannerItem)=>item.id));
  if(returnedIds.size!==data.items.length||items.some(item=>!returnedIds.has(item.id)))throw new Error('同步服务未返回完整的保存结果，本机修改已保留。');
  return data;
}
// An edit made while the network request was in flight must stay in the outbox.
export function mergeSync(local:PlannerItem[],pending:string[],submitted:PlannerItem[],response:SyncResponse):{items:PlannerItem[];pending:string[]}{
  const map=new Map(local.map(x=>[x.id,x])); const sent=new Map(submitted.map(x=>[x.id,JSON.stringify(x)])); const pendingSet=new Set(pending);
  for(const remote of response.items){
    const current=map.get(remote.id); const submittedVersion=sent.get(remote.id);
    if(pendingSet.has(remote.id) && (!submittedVersion || JSON.stringify(current)!==submittedVersion))continue;
    map.set(remote.id,remote);if(submittedVersion)pendingSet.delete(remote.id);
  }
  return {items:[...map.values()],pending:[...pendingSet]};
}
