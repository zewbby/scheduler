import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {accountLogin} from '../lib/auth';
import {nextTimestamp,validDate,type PlannerItem} from '../lib/model';
import {downloadText,loadData,parseBackup,saveData,type PlannerData} from '../lib/storage';
import {dateKey} from '../lib/model';
import {clearToken,getToken,mergeSync,normalizedEndpoint,readConfig,selectSyncBatch,setToken,syncRequest} from '../lib/sync';
function boot(){try{return {data:loadData(),error:''};}catch(error){return {data:{version:1,items:[],pending:[],cursor:0,example:false} as PlannerData,error:error instanceof Error?error.message:'本地数据无法读取'};}}
export function usePlanner(initialNotice=''){
 const [initial]=useState(boot);const [data,setData]=useState(initial.data);const dataRef=useRef(data);
 const [config,setConfig]=useState(readConfig);const [syncStatus,setSyncStatus]=useState('尚未同步');const [syncing,setSyncing]=useState(false);const [syncError,setSyncError]=useState(initialNotice);const [storageError,setStorageError]=useState('');
 const syncingRef=useRef(false);const changingSyncConfig=useRef(false);const syncGeneration=useRef(0);const [syncKick,setSyncKick]=useState(0);const searchInput=useRef<HTMLInputElement>(null);const [tick,setTick]=useState(Date.now());
 useEffect(()=>{changingSyncConfig.current=false;return()=>{changingSyncConfig.current=true;syncGeneration.current++;};},[]);

 const notify=useCallback((message:string)=>setToast(message),[]);
 const [toast,setToast]=useState('');const [undo,setUndo]=useState<PlannerItem|null>(null);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),4000);return()=>clearTimeout(timer);},[toast]);
 const commit=useCallback((update:(current:PlannerData)=>PlannerData):boolean=>{if(initial.error)return false;const next=update(dataRef.current);try{saveData(next);dataRef.current=next;setData(next);setStorageError('');return true;}catch{setStorageError('本地存储空间不足，修改未保存。请先导出备份后重试。');return false;}},[initial.error]);
 const active=useMemo(()=>data.items.filter(item=>!item.deleted),[data.items]);
 const startOwn=()=>{if(commit(current=>({...current,items:[],pending:[],cursor:0,example:false})))notify('已收起示例，开始自己的待办。');};
 const addTask=(date:string,title:string):boolean=>{const value=title.trim();if(!value||value.length>200||!validDate(date))return false;return commit(current=>{const stamp=nextTimestamp(current.items);const item:PlannerItem={id:crypto.randomUUID(),date,title:value,startTime:'',endTime:'',category:'work',notes:'',completed:false,deleted:false,updatedAt:stamp,createdAt:stamp};return {...current,example:false,items:[...(current.example?[]:current.items),item],pending:[...new Set([...(current.example?[]:current.pending),item.id])]};});};
 const updateTask=(id:string,patch:Partial<PlannerItem>):boolean=>commit(current=>({...current,items:current.items.map(item=>item.id===id?{...item,...patch,updatedAt:nextTimestamp(current.items)}:item),pending:current.example?[]:[...new Set([...current.pending,id])]}));
 const toggleTask=(item:PlannerItem)=>updateTask(item.id,{completed:!item.completed});
 const renameTask=(id:string,title:string)=>title.trim().length>0&&title.trim().length<=200?updateTask(id,{title:title.trim()}):false;
 const deleteTask=(item:PlannerItem)=>{if(updateTask(item.id,{deleted:true})){setUndo(item);notify('待办已删除');}};
 const undoTask=()=>{if(undo&&updateTask(undo.id,{deleted:false})){setUndo(null);notify('待办已恢复');}};
 const runSync=useCallback(async()=>{
   if(!config.endpoint||syncingRef.current||changingSyncConfig.current||dataRef.current.example||initial.error)return;
   syncingRef.current=true;setSyncing(true);setSyncError('');const generation=syncGeneration.current;
   try{const token=await getToken();if(generation!==syncGeneration.current)return;if(!token)throw new Error('请在设置中重新连接云端账号。');let batches=0;
     do{if(generation!==syncGeneration.current)return;const current=dataRef.current;const submitted=selectSyncBatch(current.items,current.pending,current.cursor);const response=await syncRequest(config.endpoint,token,current.cursor,submitted);if(generation!==syncGeneration.current)return;
       const saved=commit(latest=>({...latest,...mergeSync(latest.items,latest.pending,submitted,response),cursor:response.cursor}));if(!saved)throw new Error('同步结果无法保存在本机，请先导出备份。');batches++;if(!dataRef.current.pending.length)break;
     }while(batches<100);
     if(generation===syncGeneration.current)setSyncStatus(dataRef.current.pending.length?`还有 ${dataRef.current.pending.length} 条待同步`:`已同步 · ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`);
   }catch(e){if(generation===syncGeneration.current){setSyncError(e instanceof Error?e.message:'网络连接失败，日程已保存在本机。');setSyncStatus('待同步 · 本机数据已保存');}}finally{syncingRef.current=false;setSyncing(false);if(generation!==syncGeneration.current)setSyncKick(v=>v+1);}
 },[config.endpoint,commit,initial.error]);
 useEffect(()=>{if(!config.endpoint)return;const t=setTimeout(()=>void runSync(),1400);return()=>clearTimeout(t);},[data.pending.length,data.cursor,data.example,config.endpoint,runSync,syncKick]);
 useEffect(()=>{const online=()=>void runSync();window.addEventListener('online',online);const t=setInterval(online,60000);return()=>{clearInterval(t);window.removeEventListener('online',online);};},[runSync]);
 const connect=async(endpoint:string,token:string)=>{
   const url=normalizedEndpoint(endpoint);if(!/^[^\s]{32,512}$/.test(token.trim()))throw new Error('请填写 32–512 位且不含空格的同步密钥。');
   changingSyncConfig.current=true;syncGeneration.current++;let credentialsChanged=false;const previousConfig=localStorage.getItem('liubai.sync');let previousToken='';
   try{previousToken=await getToken();await syncRequest(url,token.trim(),0,[]);
     if(!commit(current=>({...current,cursor:0,pending:current.example?[]:current.items.map(x=>x.id)})))throw new Error('本机数据暂时无法保存，请导出备份后重试。');
     await setToken(token.trim());credentialsChanged=true;localStorage.setItem('liubai.sync',JSON.stringify({endpoint:url}));
     if(!commit(current=>({...current,example:false,items:current.example?[]:current.items,pending:current.example?[]:current.pending})))throw new Error('本机数据暂时无法保存，请导出备份后重试。');
     setConfig({endpoint:url});setSyncStatus('已连接 · 正在准备同步');notify('云端已连接，正在合并日程。');
   }catch(error){if(credentialsChanged){try{if(previousToken)await setToken(previousToken);else await clearToken();if(previousConfig)localStorage.setItem('liubai.sync',previousConfig);else localStorage.removeItem('liubai.sync');}catch{localStorage.removeItem('liubai.sync');setConfig({endpoint:''});}}throw error;
   }finally{changingSyncConfig.current=false;setSyncKick(v=>v+1);}
 };
 const disconnect=async()=>{changingSyncConfig.current=true;syncGeneration.current++;try{localStorage.setItem('liubai.sync',JSON.stringify({endpoint:''}));setConfig({endpoint:''});await clearToken();setSyncError('');setSyncStatus('尚未同步');notify('已断开同步，本机日程已保留。');}finally{changingSyncConfig.current=false;}};
 const connectAccount=async(endpoint:string,name:string,password:string)=>{const token=await accountLogin(endpoint,name,password);await connect(endpoint,token);};
 const exportData=()=>{downloadText(JSON.stringify({version:1,exportedAt:new Date().toISOString(),items:dataRef.current.items},null,2),`冲冲冲日程-${dateKey(new Date())}.json`);notify('日程备份已导出');};
 const importData=(text:string)=>{const imported=parseBackup(text);if(commit(current=>{const map=new Map((current.example?[]:current.items).map(x=>[x.id,x]));const changed:string[]=[];for(const item of imported){const old=map.get(item.id);if(!old||item.updatedAt>old.updatedAt||(item.updatedAt===old.updatedAt&&item.deleted&&!old.deleted)){map.set(item.id,item);changed.push(item.id);}}return {...current,example:false,items:[...map.values()],pending:[...new Set([...current.pending,...changed])]};}))notify(`已合并 ${imported.length} 条日程记录`);};

 return {data,active,bootError:initial.error,storageError,config,syncStatus,syncing,syncError,toast,undo,startOwn,addTask,toggleTask,renameTask,deleteTask,undoTask,runSync,connect,connectAccount,disconnect,exportData,importData};
}
