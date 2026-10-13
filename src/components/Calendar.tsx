import { useEffect, useRef } from 'react';
import { Check, Plus } from 'lucide-react';
import { dateKey, daysInView, monthDays, minutes, timeLabel, layoutEvents, type PlannerItem } from '../lib/model';
export type View='week'|'month'|'day';
interface Props {date:Date;view:View;items:PlannerItem[];onSelect:(date:Date)=>void;onEdit:(item:PlannerItem)=>void;onCreate:(date:string,time?:string)=>void;onMove:(id:string,date:string,time:string)=>void;}
const WEEKDAYS=['周日','周一','周二','周三','周四','周五','周六'];
export default function Calendar({date,view,items,onSelect,onEdit,onCreate,onMove}:Props){
  const scrollRef=useRef<HTMLDivElement>(null);
  const now=new Date();const today=dateKey(now);const selected=dateKey(date);
  const days=daysInView(date,view==='day'?'day':'week');
  const visible=items.filter(x=>days.some(d=>dateKey(d)===x.date));
  const start=Math.min(7,...visible.map(x=>Math.floor(minutes(x.startTime)/60)));
  const end=Math.max(22,...visible.map(x=>Math.ceil(minutes(x.endTime)/60)));
  const hourHeight=68;
  useEffect(()=>{if(scrollRef.current)scrollRef.current.scrollTop=(Math.max(8,start)-start)*hourHeight-14;},[view,start]);
  if(view==='month')return <div className="month-view view-reveal" key={`month-${date.getMonth()}`}>
    <div className="month-weekdays">{['一','二','三','四','五','六','日'].map(d=><span key={d}>周{d}</span>)}</div>
    <div className="month-grid">{monthDays(date).map(day=>{const key=dateKey(day),rows=items.filter(x=>x.date===key).sort((a,b)=>a.startTime.localeCompare(b.startTime));return <div className={`month-cell ${day.getMonth()!==date.getMonth()?'outside':''} ${key===selected?'selected':''}`} key={key} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');const item=items.find(x=>x.id===id);if(item)onMove(id,key,item.startTime);}}>
      <div className="month-cell-top"><button className={`date-number ${key===today?'is-today':''}`} aria-label={`选择 ${key}`} onClick={()=>onSelect(day)}>{day.getDate()}</button><button className="month-add icon-button" aria-label={`${key} 新建日程`} onClick={()=>onCreate(key)}><Plus size={14}/></button></div>
      {rows.slice(0,3).map(item=><button key={item.id} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',item.id)} onClick={()=>onEdit(item)} className={`month-event ${item.completed?'completed':''}`}><span className={`category-mark ${item.category}`}/><span>{item.startTime}</span><strong>{item.title}</strong></button>)}
      {rows.length>3&&<button className="more-events" onClick={()=>onSelect(day)}>还有 {rows.length-3} 项</button>}
    </div>;})}</div>
  </div>;
  return <div className={`calendar-view ${view==='day'?'single-day':''} view-reveal`}>
    <div className="week-heading"><div className="time-zone">本地<br/>时间</div><div className="week-days" style={{gridTemplateColumns:`repeat(${days.length},minmax(0,1fr))`}}>{days.map(day=>{const key=dateKey(day);return <button key={key} className={`day-heading ${key===selected?'selected':''}`} onClick={()=>onSelect(day)}><span>{WEEKDAYS[day.getDay()]}</span><b className={key===today?'is-today':''}>{String(day.getDate()).padStart(2,'0')}</b>{key===today&&<i>今天</i>}</button>;})}</div></div>
    <div className="calendar-scroll" ref={scrollRef}>
      <div className="time-grid" style={{height:(end-start)*hourHeight}}>
        <div className="time-labels">{Array.from({length:end-start},(_,i)=><span key={i} style={{top:i*hourHeight}}>{timeLabel((start+i)*60)}</span>)}</div>
        <div className="day-columns" style={{gridTemplateColumns:`repeat(${days.length},minmax(0,1fr))`}}>
          {days.map(day=>{const key=dateKey(day),events=layoutEvents(items.filter(x=>x.date===key));const currentMinute=now.getHours()*60+now.getMinutes();return <div key={key} className={`day-column ${key===selected?'selected':''}`}>
            {Array.from({length:end-start},(_,i)=><button key={i} className="hour-slot" style={{top:i*hourHeight,height:hourHeight}} aria-label={`${key} ${timeLabel((start+i)*60)} 新建日程`} onDoubleClick={()=>onCreate(key,timeLabel((start+i)*60))} onClick={()=>onSelect(day)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();onCreate(key,timeLabel((start+i)*60));}}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();onMove(e.dataTransfer.getData('text/plain'),key,timeLabel((start+i)*60));}}><span className="slot-hint"><Plus size={12}/> 添加日程</span></button>)}
            {events.map(({item,column,columns})=>{const duration=minutes(item.endTime)-minutes(item.startTime);return <button draggable onDragStart={e=>{e.dataTransfer.setData('text/plain',item.id);e.dataTransfer.effectAllowed='move';}} title={`${item.title} · ${item.startTime}–${item.endTime}`} key={item.id} className={`calendar-event category-${item.category} ${item.completed?'completed':''} ${duration<45?'compact':''}`} style={{top:(minutes(item.startTime)-start*60)/60*hourHeight+2,height:Math.max(duration/60*hourHeight-4,25),left:`calc(${column/columns*100}% + 5px)`,width:`calc(${100/columns}% - 10px)`}} onClick={()=>onEdit(item)}><span className="event-time">{item.startTime} <span>– {item.endTime}</span>{item.completed&&<Check size={11}/>}</span><strong>{item.title}</strong>{duration>=90&&<span className="event-note">{item.notes}</span>}</button>;})}
            {key===today&&currentMinute>=start*60&&currentMinute<=end*60&&<div className="now-line" style={{top:(currentMinute-start*60)/60*hourHeight}}><span/></div>}
          </div>;})}
        </div>
      </div>
    </div>
    <div className="calendar-foot"><span><span className="tiny-dot"/> 给日程一点秩序，给生活一些留白。</span><span>双击空白处新建 · 拖动日程调整</span></div>
  </div>;
}
