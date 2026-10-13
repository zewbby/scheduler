export type Category = 'work' | 'life' | 'growth';
export interface PlannerItem {
  id: string; title: string; date: string; startTime: string; endTime: string;
  category: Category; notes: string; completed: boolean; updatedAt: number; deleted: boolean;
  createdAt?: number;
  time?: string;
}
export const CATEGORIES: {id: Category; label: string; symbol: string}[] = [
  {id: 'work', label: '工作', symbol: '●'}, {id: 'life', label: '生活', symbol: '○'}, {id: 'growth', label: '成长', symbol: '◇'},
];
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function parseDate(key: string): Date { const [y,m,d] = key.split('-').map(Number); return new Date(y,m-1,d,12); }
export function addDays(date: Date, days: number): Date { const d = new Date(date); d.setDate(d.getDate()+days); return d; }
export function startOfWeek(date: Date): Date { return addDays(date, -((date.getDay()+6)%7)); }
export function daysInView(date: Date, view: 'week'|'day'): Date[] { return view==='day' ? [date] : Array.from({length:7},(_,i)=>addDays(startOfWeek(date),i)); }
export function monthDays(date: Date): Date[] { return Array.from({length:42}, (_,i)=>addDays(startOfWeek(new Date(date.getFullYear(),date.getMonth(),1,12)),i)); }
export function minutes(time: string): number { const [h,m]=time.split(':').map(Number); return h*60+m; }
export function timeLabel(n: number): string { return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`; }
export function validDate(date: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(date) && dateKey(parseDate(date))===date; }
export function validTime(time:unknown):time is string{return typeof time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);}
export function taskTime(item:PlannerItem):string{return item.time!==undefined?item.time:item.startTime;}
export function taskOrder(a:PlannerItem,b:PlannerItem):number{const byTime=(taskTime(a)||'99:99').localeCompare(taskTime(b)||'99:99');if(byTime)return byTime;if(a.createdAt&&b.createdAt)return a.createdAt-b.createdAt;return a.createdAt?1:b.createdAt?-1:0;}
export function validItem(value: unknown): value is PlannerItem {
  if (!value || typeof value!=='object') return false;
  const x=value as PlannerItem;
  return typeof x.id==='string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x.id) && typeof x.title==='string' && x.title.trim().length>0 && x.title.length<=200
    && typeof x.date==='string' && validDate(x.date) && ((x.startTime===''&&x.endTime==='') || (/^([01]\d|2[0-3]):[0-5]\d$/.test(x.startTime) && /^([01]\d|2[0-3]):[0-5]\d$/.test(x.endTime) && minutes(x.endTime)>minutes(x.startTime)))
    && CATEGORIES.some(c=>c.id===x.category) && typeof x.notes==='string' && x.notes.length<=10000
    && typeof x.completed==='boolean' && typeof x.deleted==='boolean' && Number.isSafeInteger(x.updatedAt) && x.updatedAt>0
    && (x.createdAt===undefined||(Number.isSafeInteger(x.createdAt)&&x.createdAt>0&&x.createdAt<=x.updatedAt))
    && (x.time===undefined||x.time===''||validTime(x.time));
}
export function nextTimestamp(items: PlannerItem[]): number { return Math.max(Date.now(), ...items.map(x=>x.updatedAt+1)); }
export interface PositionedItem { item: PlannerItem; column: number; columns: number; }
// Partition overlapping intervals into connected groups, then assign the first free lane.
export function layoutEvents(items: PlannerItem[]): PositionedItem[] {
  const sorted=[...items].sort((a,b)=>minutes(a.startTime)-minutes(b.startTime)||minutes(b.endTime)-minutes(a.endTime));
  const result: PositionedItem[]=[]; let group: PositionedItem[]=[]; let ends: number[]=[]; let groupEnd=-1;
  const flush=()=>{ const columns=ends.length; group.forEach(x=>result.push({...x,columns})); group=[]; ends=[]; };
  for(const item of sorted){
    const start=minutes(item.startTime),end=minutes(item.endTime);
    if(start>=groupEnd) flush();
    let column=ends.findIndex(e=>e<=start); if(column<0)column=ends.length;
    ends[column]=end; groupEnd=Math.max(groupEnd,end); group.push({item,column,columns:1});
  }
  flush(); return result;
}
export function createExamples(today: Date): PlannerItem[] {
  const monday=startOfWeek(today);
  const rows: [number,string,string,string,Category,string][]=[
    [0,'09:00','10:00','一周计划','work','给这一周，确定几个小小的方向。'],
    [0,'14:00','15:30','沉浸创作','growth','留一段不被打扰的时间。'],
    [1,'09:30','10:30','产品设计讨论','work','梳理想法，找到最简单的答案。'],
    [1,'12:00','13:00','好好吃一顿午饭','life','暂时放下屏幕。'],
    [1,'15:00','16:30','阅读与摘记','growth','读几页书，记下新的灵感。'],
    [2,'10:00','11:30','专注工作','work','把注意力交给一件重要的事。'],
    [2,'18:00','19:00','去散个步','life','走慢一点，看看傍晚的天空。'],
    [3,'09:00','10:00','项目进度回顾','work','记录进展，也记录值得庆祝的小事。'],
    [3,'14:00','15:00','灵感收集','growth','让想法自由生长。'],
    [4,'10:00','11:00','本周收尾','work','为下周的自己，留一点从容。'],
    [4,'16:00','17:00','咖啡时间','life','和朋友见个面。'],
    [5,'10:30','12:00','逛逛书店','life','偶遇一本喜欢的书。'],
    [6,'16:00','17:00','整理生活','life','给空间，也给心情留白。'],
  ];
  return rows.map(([day,startTime,endTime,title,category,notes],index)=>({id:`example-${index}`,title,date:dateKey(addDays(monday,day)),startTime,endTime,category,notes,completed:index===0,updatedAt:Date.now(),deleted:false}));
}
