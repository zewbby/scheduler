import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowRight,Check,ChevronLeft,ChevronRight,Cloud,CloudOff,LoaderCircle,RefreshCw,Search,Settings as SettingsIcon} from 'lucide-react';
import Settings from './components/Settings';
import Modal from './components/Modal';
import AvatarPicker from './components/AvatarPicker';
import DayCard,{type CardOrigin} from './components/DayCard';
import {usePlanner} from './hooks/usePlanner';
import {useAvatar} from './hooks/useAvatar';
import {avatarUrl} from './lib/avatar';
import {dateKey,parseDate,taskTime,taskOrder,type PlannerItem} from './lib/model';
import {downloadText,rawBackup} from './lib/storage';
import './cards.css';

function monthLayout(date:Date){const first=new Date(date.getFullYear(),date.getMonth(),1,12),offset=(first.getDay()+6)%7,count=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();return{offset,count,rows:Math.ceil((offset+count)/7)};}
function DateTile({day,number,today,items,onOpen}:{day:string;number:number;today:boolean;items:PlannerItem[];onOpen:(day:string,element:HTMLElement)=>void}){
 const ref=useRef<HTMLButtonElement>(null),[capacity,setCapacity]=useState(2);
 useEffect(()=>{const element=ref.current;if(!element)return;const observer=new ResizeObserver(entries=>{const height=entries[0].contentRect.height,available=Math.max(1,Math.floor((height-40)/21));setCapacity(Math.max(1,Math.min(3,items.length>available?Math.floor((height-57)/21):available)));});observer.observe(element);return()=>observer.disconnect();},[items.length]);
 const hint=items.map(item=>`${item.completed?'✓ ':''}${taskTime(item)?taskTime(item)+' ':''}${item.title}`).join('\n');
 return <button ref={ref} className={`date-card ${today?'is-today':''}`} aria-label={`打开 ${day} 待办卡片`} aria-haspopup="dialog" title={hint||undefined} onClick={event=>onOpen(day,event.currentTarget)}>
  <span className="date-card-heading"><span className="date-number">{String(number).padStart(2,'0')}</span>{today&&<span className="today-dot" aria-label="今天"/>}</span>
  <span className="date-preview">{items.slice(0,capacity).map(item=><span className={`date-preview-line ${item.completed?'preview-done':''}`} key={item.id}>{item.title}</span>)}{items.length>capacity&&<span className="date-more" aria-label={`还有 ${items.length-capacity} 件待办`} title={items.slice(capacity).map(item=>item.title).join('\n')}>…</span>}</span>
 </button>;
}
export default function CardApp({onLogout,username='',initialNotice=''}:{onLogout:()=>void;username?:string;initialNotice?:string}){
 const planner=usePlanner(initialNotice),avatar=useAvatar(planner.config.endpoint),[month,setMonth]=useState(new Date()),[opened,setOpened]=useState<{day:string;origin?:CardOrigin}|null>(null),[settings,setSettings]=useState(false),[avatarOpen,setAvatarOpen]=useState(false),[searchOpen,setSearchOpen]=useState(false),[query,setQuery]=useState('');
 const today=dateKey(new Date()),{offset,count,rows}=monthLayout(month),prefix=`${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`;
 const byDay=useMemo(()=>{const map=new Map<string,PlannerItem[]>();for(const item of planner.active){const list=map.get(item.date)||[];list.push(item);map.set(item.date,list);}for(const list of map.values())list.sort(taskOrder);return map;},[planner.active]);
 const results=useMemo(()=>planner.active.filter(item=>item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)),[planner.active,query]);
 const openDay=(day:string,element?:HTMLElement)=>{const box=element?.getBoundingClientRect();setOpened({day,origin:box?{left:box.left,top:box.top,width:box.width,height:box.height}:undefined});};
 useEffect(()=>{const listener=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!settings&&!avatarOpen&&!opened){event.preventDefault();setSearchOpen(true);}};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[settings,avatarOpen,opened]);
 if(planner.bootError)return <div className="recovery"><CloudOff size={38}/><h1>先保管好你的记录。</h1><p>{planner.bootError}</p><button className="primary-button" onClick={()=>downloadText(rawBackup(),'冲冲冲-原始数据备份.json')}>导出原始数据</button></div>;
 const error=planner.storageError||planner.syncError,synced=planner.syncStatus.startsWith('已同步')&&!planner.syncing&&!planner.syncError&&!planner.data.pending.length&&!avatar.pending;
 return <div className="app-shell planner-app"><div className="titlebar" aria-hidden="true"/>
  <div className="month-desk"><header className="planner-header"><div className="planner-brand"><img src="./avatars/notebook-yellow.svg" alt=""/><strong>冲冲冲</strong></div><div className="planner-header-actions">{planner.data.example&&<button className="clear-demo" onClick={planner.startOwn}>开始使用</button>}<button className="icon-button" aria-label="搜索待办" title="搜索待办" onClick={()=>setSearchOpen(true)}><Search size={23}/></button><button className="icon-button" aria-label="设置" title="设置" onClick={()=>setSettings(true)}><SettingsIcon size={23}/></button><button className="planner-avatar" aria-label="更换头像" title="更换头像" onClick={()=>setAvatarOpen(true)}><img src={avatarUrl(avatar.profile)} alt="我的头像"/></button></div></header>
   <div className="month-heading"><h1>{month.getFullYear()}<span>年</span> {String(month.getMonth()+1).padStart(2,'0')}<span>月</span></h1><div className="month-navigation"><button className="icon-button return-month" aria-label="回到本月" title="回到本月" onClick={()=>setMonth(new Date())}><RefreshCw size={22}/></button><div><button className="icon-button" aria-label="上个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1,12))}><ChevronLeft size={25}/></button><button className="icon-button" aria-label="下个月" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1,12))}><ChevronRight size={25}/></button></div></div></div>
   {error&&<div className="planner-error" role="alert"><CloudOff size={18}/><span>{error}</span><button onClick={()=>void planner.runSync()}>重试</button></div>}
   <div className="month-week-labels">{['一','二','三','四','五','六','日'].map(day=><span key={day}>星期{day}</span>)}</div>
   <div className="month-card-grid" style={{gridTemplateRows:`repeat(${rows},minmax(70px,1fr))`}}>{Array.from({length:rows*7},(_,index)=>{const number=index-offset+1;if(number<1||number>count)return <div className="month-space" key={`space-${index}`} aria-hidden="true"/>;const day=`${prefix}-${String(number).padStart(2,'0')}`;return <DateTile key={day} day={day} number={number} today={day===today} items={byDay.get(day)||[]} onOpen={openDay}/>;})}</div>
   <footer className="month-footer"><button className={`planner-sync ${synced?'is-synced':''}`} onClick={()=>setSettings(true)}>{planner.syncing?<LoaderCircle size={18} className="spin"/>:synced?<Check size={17}/>:planner.config.endpoint?<Cloud size={18}/>:<CloudOff size={18}/>}<span>{planner.syncing?'正在同步…':planner.config.endpoint?avatar.pending?'头像待同步':planner.syncStatus:'保存在本机'}</span></button></footer>
  </div>
  {opened&&<DayCard key={opened.day} day={opened.day} origin={opened.origin} items={byDay.get(opened.day)||[]} onClose={()=>setOpened(null)} onAdd={planner.addTask} onToggle={planner.toggleTask} onRename={planner.renameTask} onTimeChange={planner.setTaskTime} onDelete={planner.deleteTask} notice={planner.toast||planner.storageError} canUndo={!!planner.undo&&planner.toast==='待办已删除'} onUndo={planner.undoTask}/>}
  {avatarOpen&&<AvatarPicker profile={avatar.profile} username={username} onClose={()=>setAvatarOpen(false)} onSelect={avatar.select}/>}
  {settings&&<Settings config={planner.config} status={planner.syncing?'正在同步…':avatar.pending&&planner.config.endpoint?'头像待同步':planner.syncStatus} onClose={()=>setSettings(false)} onAccountConnect={planner.connectAccount} onDisconnect={planner.disconnect} onExport={planner.exportData} onImport={planner.importData} onLogout={onLogout} username={username}/>}
  {searchOpen&&<Modal title="搜索待办" onClose={()=>{setSearchOpen(false);setQuery('');}} wide><div className="search-field"><Search size={22}/><input data-autofocus autoFocus aria-label="搜索待办名称" placeholder="输入待办名称…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="search-results">{results.length?results.slice(0,50).map(item=><button key={item.id} onClick={()=>{setSearchOpen(false);setQuery('');setMonth(parseDate(item.date));openDay(item.date);}}><span><strong className={item.completed?'search-done':''}>{item.title}</strong><small>{item.date}</small></span>{item.completed?<Check size={20}/>:<ArrowRight size={20}/>}</button>):<p>没有找到相关待办。</p>}</div><p className="search-foot">{results.length} 项待办</p></Modal>}
  {planner.toast&&!opened&&<div className="toast" role="status"><Check size={19}/>{planner.toast}</div>}
 </div>;
}
