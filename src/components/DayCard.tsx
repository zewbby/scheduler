import {useEffect,useRef,useState} from 'react';
import {Check,Plus,X} from 'lucide-react';
import {parseDate,taskTime,validTime,type PlannerItem} from '../lib/model';
import TimePicker from './TimePicker';
import {usePreferences,weekday} from '../lib/preferences';
export interface CardOrigin{left:number;top:number;width:number;height:number;}
const WEEK=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
interface Props{day:string;origin?:CardOrigin;items:PlannerItem[];onClose:()=>void;onAdd:(day:string,title:string,time:string)=>boolean;onToggle:(item:PlannerItem)=>void;onRename:(id:string,title:string)=>boolean;onTimeChange:(id:string,time:string)=>boolean;onDelete:(item:PlannerItem)=>void;notice:string;canUndo:boolean;onUndo:()=>void;}
export default function DayCard({day,origin,items,onClose,onAdd,onToggle,onRename,onTimeChange,onDelete,notice,canUndo,onUndo}:Props){
 const {t,preferences}=usePreferences(),ref=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null),addButton=useRef<HTMLButtonElement>(null),closing=useRef(false);
 const [adding,setAdding]=useState(false),[title,setTitle]=useState(''),[time,setTime]=useState(''),[timeError,setTimeError]=useState(false),[editId,setEditId]=useState<string|null>(null),[editTitle,setEditTitle]=useState(''),[menu,setMenu]=useState<{item:PlannerItem;x:number;y:number}|null>(null);
 const date=parseDate(day),reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 const transform=()=>{if(!origin||!ref.current)return 'translateY(12px) scale(.96)';const box=ref.current.getBoundingClientRect();return `translate(${origin.left+origin.width/2-box.left-box.width/2}px,${origin.top+origin.height/2-box.top-box.height/2}px) scale(${Math.max(.15,Math.min(origin.width/box.width,origin.height/box.height))})`;};
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();if(dialog&&!reduced())dialog.animate([{transform:transform(),opacity:.1},{transform:'none',opacity:1}],{duration:280,easing:'cubic-bezier(.16,1,.3,1)'});return()=>dialog?.close();},[]);
 useEffect(()=>{if(adding)input.current?.focus();},[adding]);
 const close=()=>{if(closing.current)return;closing.current=true;if(!ref.current||reduced()){onClose();return;}ref.current.animate([{transform:'none',opacity:1},{transform:transform(),opacity:0}],{duration:160,easing:'ease-in'}).finished.then(onClose,onClose);};
 const cancelAdd=()=>{setAdding(false);setTitle('');setTime('');setTimeError(false);addButton.current?.focus();};
 const beginAdd=()=>{if(adding){cancelAdd();return;}setAdding(true);setMenu(null);requestAnimationFrame(()=>input.current?.focus());};
 const saveEdit=()=>{if(editId){onRename(editId,editTitle);setEditId(null);}};
 const cancelField=(event:React.KeyboardEvent)=>{event.preventDefault();event.stopPropagation();};
 return <dialog ref={ref} className="day-card-dialog" aria-label={t(`${day} 的待办卡片`)} onCancel={event=>{event.preventDefault();if(menu)setMenu(null);else if(adding)cancelAdd();else close();}} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}if(menu)setMenu(null);}}>
  <header className="day-card-header"><div className="day-card-date"><h2>{String(date.getDate()).padStart(2,'0')}</h2><div><p>{preferences.language==='en'?date.toLocaleDateString('en',{year:'numeric',month:'long'}):`${date.getFullYear()} 年 ${date.getMonth()+1} 月`}</p><strong>{weekday(date.getDay(),preferences.language)}</strong></div></div><button className="day-close icon-button" aria-label={t('关闭卡片')} title={t('关闭卡片')} onClick={close}><X size={25}/></button></header>
  <div className="day-card-body"><ul className="todo-lines">{items.map(item=><li key={item.id} className={`todo-line ${item.completed?'is-done':''}`}>
   {editId===item.id?<input className="todo-edit" aria-label={t("修改待办名称")} autoFocus maxLength={200} value={editTitle} onChange={e=>setEditTitle(e.target.value)} onBlur={saveEdit} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();saveEdit();}if(e.key==='Escape'){cancelField(e);setEditId(null);}}}/>:<button className="todo-title" title={t("双击修改名称，右键管理")} onDoubleClick={()=>{setEditTitle(item.title);setEditId(item.id);}} onContextMenu={event=>{event.preventDefault();setMenu({item,x:event.clientX,y:event.clientY});}} onKeyDown={event=>{if(event.key==='F2'){setEditTitle(item.title);setEditId(item.id);}}}>{item.title}</button>}
   <TimePicker value={taskTime(item)} label={`修改 ${item.title} 的时间`} triggerClass="todo-time" allowClear onChange={value=>{if(value!==taskTime(item))onTimeChange(item.id,value);}}/>
   <button className="todo-check" aria-label={t(`${item.completed?'取消完成':'完成'} ${item.title}`)} aria-pressed={item.completed} onClick={()=>onToggle(item)}><Check size={23}/></button>
  </li>)}</ul>
  {!items.length&&<div className="day-empty"><img src="./avatars/notebook-peach.svg" alt=""/><p>{t("哥今天想干点啥？")}</p></div>}
  </div>
  <footer className="day-card-footer">{adding&&<form className="add-todo-form" onSubmit={e=>{e.preventDefault();if(!validTime(time)){setTimeError(true);return;}if(onAdd(day,title,time))cancelAdd();}}><input ref={input} aria-label={t('待办名称')} placeholder={t('写下待办')} required value={title} maxLength={200} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){cancelField(e);cancelAdd();}}}/><TimePicker value={time} label="待办时间" onChange={value=>{setTime(value);setTimeError(false);requestAnimationFrame(()=>input.current?.focus());}}/><button type="submit" aria-label={t('保存待办')}><ArrowEnter/></button></form>}
   {timeError&&<span className="add-time-error" role="alert">{preferences.language==='en'?'Choose a time first.':'请先选择时间。'}</span>}
   <button ref={addButton} className="day-add" aria-label={t(adding?'取消添加':'添加待办')} title={t(adding?'取消添加':'添加待办')} onClick={beginAdd}>{adding?<X size={27}/>:<Plus size={30}/>}</button>
   {notice&&<span className="day-notice" role="status">{t(notice)}{canUndo&&<button onClick={onUndo}>{t("撤销")}</button>}</span>}
  </footer>
  {menu&&<div className="todo-context-menu" role="menu" style={{left:Math.min(menu.x,window.innerWidth-166),top:Math.min(menu.y,window.innerHeight-106)}} onClick={e=>e.stopPropagation()}><button role="menuitem" onClick={()=>{setEditId(menu.item.id);setEditTitle(menu.item.title);setMenu(null);}}>{t('修改名称')}</button><button role="menuitem" onClick={()=>{onDelete(menu.item);setMenu(null);}}>{t('删除待办')}</button></div>}
 </dialog>;
}
function ArrowEnter(){return <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 5v9H4m5-5-5 5 5 5"/></svg>;}
