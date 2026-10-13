import { useState } from 'react';
import { ArrowRight, Clock3, Trash2, CalendarDays, Check } from 'lucide-react';
import { CATEGORIES, minutes, validDate, type PlannerItem, type Category } from '../lib/model';
import Modal from './Modal';
export default function EventForm({item,date,time='09:00',onClose,onSave,onDelete}:{item?:PlannerItem;date:string;time?:string;onClose:()=>void;onSave:(values:Omit<PlannerItem,'id'|'updatedAt'|'deleted'>,id?:string)=>void;onDelete:(id:string)=>void}){
 const [title,setTitle]=useState(item?.title||'');const [day,setDay]=useState(item?.date||date);
 const [start,setStart]=useState(item?.startTime||time);const [end,setEnd]=useState(item?.endTime||(time.slice(0,2)==='23'?'23:59':`${String(Number(time.slice(0,2))+1).padStart(2,'0')}:${time.slice(3)}`));
 const [category,setCategory]=useState<Category>(item?.category||'work');const [notes,setNotes]=useState(item?.notes||'');const [completed,setCompleted]=useState(item?.completed||false);const [error,setError]=useState('');const [deleting,setDeleting]=useState(false);
 return <Modal title={item?'日程详情':'留一点时间'} onClose={onClose}><form onSubmit={e=>{e.preventDefault();if(!title.trim()){setError('给这件事起一个名字吧。');return;}if(!validDate(day)){setError('请选择有效的日期。');return;}if(!start||!end||minutes(end)<=minutes(start)){setError('结束时间要晚于开始时间，跨天日程请按天分别添加。');return;}onSave({title:title.trim(),date:day,startTime:start,endTime:end,category,notes,completed},item?.id);}}>
   <input className="event-title-input" aria-label="日程名称" data-autofocus autoFocus placeholder="想把时间留给什么？" maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/>
   <div className="form-date-row"><label><span><CalendarDays size={15}/> 日期</span><input type="date" required aria-label="日期" value={day} onChange={e=>setDay(e.target.value)}/></label><div className="time-fields"><span><Clock3 size={15}/> 时间</span><div><input type="time" required aria-label="开始时间" value={start} onChange={e=>setStart(e.target.value)}/><ArrowRight size={14}/><input type="time" required aria-label="结束时间" value={end} onChange={e=>setEnd(e.target.value)}/></div></div></div>
   <fieldset className="category-picker"><legend>所属日历</legend>{CATEGORIES.map(c=><button type="button" key={c.id} className={category===c.id?'active':''} onClick={()=>setCategory(c.id)}><span>{c.symbol}</span>{c.label}{category===c.id&&<Check size={13}/>}</button>)}</fieldset>
   <label className="notes-label">随手记<textarea placeholder="补充地点、灵感，或一点小提醒…" maxLength={10000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
   {item&&<label className="completed-toggle"><input type="checkbox" checked={completed} onChange={e=>setCompleted(e.target.checked)}/> 这件事，已经完成了</label>}
   {error&&<p role="alert" className="form-error">{error}</p>}
   <footer className="form-footer">{item?<button type="button" className={`text-button delete-button ${deleting?'confirm-delete':''}`} onClick={()=>{if(deleting)onDelete(item.id);else setDeleting(true);}}><Trash2 size={15}/>{deleting?'确认删除':'删除日程'}</button>:<span className="form-hint">每一个安排，都算数。</span>}<button type="submit" className="primary-button">{item?'保存修改':'创建日程'}<ArrowRight size={15}/></button></footer>
 </form></Modal>;
}
