import { createExamples, validItem, type PlannerItem } from './model';
export interface PlannerData {version: 1; items: PlannerItem[]; pending: string[]; cursor: number; example: boolean;}
const KEY='liubai.planner.v1';
export function loadData(): PlannerData {
  const raw=localStorage.getItem(KEY);
  if(!raw)return {version:1,items:createExamples(new Date()),pending:[],cursor:0,example:true};
  const data=JSON.parse(raw);
  if(data.version!==1 || !Array.isArray(data.items) || !data.items.every(validItem) || !Array.isArray(data.pending) || !data.pending.every((id:unknown)=>typeof id==='string') || !Number.isSafeInteger(data.cursor) || data.cursor<0 || typeof data.example!=='boolean') throw new Error('本地数据格式异常，请先导出原始备份。');
  return data;
}
export function saveData(data: PlannerData): void { localStorage.setItem(KEY,JSON.stringify(data)); }
export function rawBackup(): string { return localStorage.getItem(KEY) ?? '{}'; }
export function downloadText(content:string,name:string){ const url=URL.createObjectURL(new Blob([content],{type:'application/json'})); const a=document.createElement('a'); a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
export function parseBackup(text:string):PlannerItem[]{ const data=JSON.parse(text);const items=Array.isArray(data)?data:data.items;if(!Array.isArray(items)||items.length>50000||!items.every(validItem)||new Set(items.map(x=>x.id)).size!==items.length)throw new Error('备份格式不正确，请选择留白导出的 JSON 文件。');return items; }
