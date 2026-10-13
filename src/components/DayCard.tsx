import {useEffect,useRef,useState} from 'react';
import {Check,Clock3,Plus,X} from 'lucide-react';
import {parseDate,taskTime,validTime,type PlannerItem} from '../lib/model';
export interface CardOrigin{left:number;top:number;width:number;height:number;}
const WEEK=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
interface Props{day:string;origin?:CardOrigin;items:PlannerItem[];onClose:()=>void;onAdd:(day:string,title:string,time:string)=>boolean;onToggle:(item:PlannerItem)=>void;onRename:(id:string,title:string)=>boolean;onTimeChange:(id:string,time:string)=>boolean;onDelete:(item:PlannerItem)=>void;notice:string;canUndo:boolean;onUndo:()=>void;}
export default function DayCard({day,origin,items,onClose,onAdd,onToggle,onRename,onTimeChange,onDelete,notice,canUndo,onUndo}:Props){
 const ref=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),closing=useRef(false);
 const [adding,setAdding]=useState(false),[title,setTitle]=useState(''),[time,setTime]=useState(''),[editId,setEditId]=useState<string|null>(null),[editTitle,setEditTitle]=useState(''),[timeId,setTimeId]=useState<string|null>(null),[editTime,setEditTime]=useState(''),[menu,setMenu]=useState<{item:PlannerItem;x:number;y:number}|null>(null);
 const date=parseDate(day),reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const transform=()=>{if(!origin||!ref.current)return 'translateY(12px) scale(.96)';const box=ref.current.getBoundingClientRect();return `translate(${origin.left+origin.width/2-box.left-box.width/2}px,${origin.top+origin.height/2-box.top-box.height/2}px) scale(${Math.max(.15,Math.min(origin.width/box.width,origin.height/box.height))})`;};
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();if(dialog&&!reduced())dialog.animate([{transform:transform(),opacity:.1},{transform:'none',opacity:1}],{duration:280,easing:'cubic-bezier(.16,1,.3,1)'});return()=>dialog?.close();},[]);
 useEffect(()=>{if(adding)input.current?.focus();},[adding]);
 const close=()=>{if(closing.current)return;closing.current=true;if(!ref.current||reduced()){onClose();return;}ref.current.animate([{transform:'none',opacity:1},{transform:transform(),opacity:0}],{duration:160,easing:'ease-in'}).finished.then(onClose,onClose);};
 const beginAdd=()=>{setAdding(true);setMenu(null);requestAnimationFrame(()=>input.current?.focus());};
 const saveEdit=()=>{if(editId){onRename(editId,editTitle);setEditId(null);}};
 const beginTime=(item:PlannerItem)=>{setEditTime(taskTime(item));setTimeId(item.id);setMenu(null);};
 const saveTime=()=>{if(timeId&&(editTime===''||validTime(editTime))){const item=items.find(item=>item.id===timeId);if(item&&taskTime(item)!==editTime)onTimeChange(timeId,editTime);setTimeId(null);}};
 const cancelField=(event:React.KeyboardEvent)=>{event.preventDefault();event.stopPropagation();};
 return <dialog ref={ref} className="day-card-dialog" aria-label={`${day} 的待办卡片`} onCancel={event=>{event.preventDefault();if(menu)setMenu(null);else close();}} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}if(menu)setMenu(null);}}>
  <header className="day-card-header"><div className="day-card-date"><h2>{String(date.getDate()).padStart(2,'0')}</h2><div><p>{date.getFullYear()} 年 {date.getMonth()+1} 月</p><strong>{WEEK[date.getDay()]}</strong></div></div><button className="day-close icon-button" aria-label="关闭卡片" title="关闭卡片" onClick={close}><X size={25}/></button></header>
  <div className="day-card-body"><ul className="todo-lines">{items.map(item=><li key={item.id} className={`todo-line ${item.completed?'is-done':''}`}>
   {editId===item.id?<input className="todo-edit" aria-label="修改待办名称" autoFocus maxLength={200} value={editTitle} onChange={e=>setEditTitle(e.target.value)} onBlur={saveEdit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveEdit();}if(e.key==='Escape'){cancelField(e);setEditId(null);}}}/>:<button className="todo-title" title="双击修改名称，右键管理" onDoubleClick={()=>{setEditTitle(item.title);setEditId(item.id);}} onContextMenu={event=>{event.preventDefault();setMenu({item,x:event.clientX,y:event.clientY});}} onKeyDown={event=>{if(event.key==='F2'){setEditTitle(item.title);setEditId(item.id);}}}>{item.title}</button>}
   {timeId===item.id?<input className="todo-time-edit" type="time" aria-label="修改待办时间" autoFocus value={editTime} onChange={e=>setEditTime(e.target.value)} onBlur={saveTime} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveTime();}if(e.key==='Escape'){cancelField(e);setTimeId(null);}}}/>:<button className={`todo-time ${taskTime(item)?'':'is-unset'}`} aria-label={`修改 ${item.title} 的时间`} title="点击修改时间" onClick={()=>beginTime(item)}>{taskTime(item)||'未设时间'}</button>}
   <button className="todo-check" aria-label={`${item.completed?'取消完成':'完成'} ${item.title}`} aria-pressed={item.completed} onClick={()=>onToggle(item)}><Check size={23}/></button>
  </li>)}</ul>
  {!items.length&&<div className="day-empty"><img src="./avatars/notebook-peach.svg" alt=""/><p>哥今天想干点啥？</p></div>}
  </div>
  <footer className="day-card-footer">{adding&&<form className="add-todo-form" onSubmit={e=>{e.preventDefault();if(onAdd(day,title,time)){setTitle('');input.current?.focus();}}}><input ref={input} aria-label="待办名称" placeholder="写下待办" required value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){cancelField(e);setAdding(false);setTitle('');}}}/><label className="add-todo-time"><Clock3 size={18}/><input type="time" aria-label="待办时间" required value={time} onChange={e=>setTime(e.target.value)}/></label><button type="submit" aria-label="保存待办"><ArrowEnter/></button></form>}
   <button className="day-add" aria-label="添加待办" title="添加待办" onClick={beginAdd}><Plus size={30}/></button>
   {notice&&<span className="day-notice" role="status">{notice}{canUndo&&<button onClick={onUndo}>撤销</button>}</span>}
  </footer>
  {menu&&<div className="todo-context-menu" role="menu" style={{left:Math.min(menu.x,window.innerWidth-166),top:Math.min(menu.y,window.innerHeight-145)}} onClick={e=>e.stopPropagation()}><button role="menuitem" onClick={()=>{setEditId(menu.item.id);setEditTitle(menu.item.title);setMenu(null);}}>修改名称</button><button role="menuitem" onClick={()=>beginTime(menu.item)}>修改时间</button><button role="menuitem" onClick={()=>{onDelete(menu.item);setMenu(null);}}>删除待办</button></div>}
 </dialog>;
}
function ArrowEnter(){return <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 5v9H4m5-5-5 5 5 5"/></svg>;}
