import {useEffect,useRef,useState} from 'react';
import {Download,Upload,ArrowUpRight,Check,Eye,EyeOff,LogOut,ChevronDown,FolderOpen,FolderInput,RefreshCw} from 'lucide-react';
import Modal from './Modal';
import {defaultEndpoint,type SyncConfig,type StorageInfo} from '../lib/sync';
import {usePreferences,type Preferences} from '../lib/preferences';
declare const __APP_VERSION__:string;
interface Props{config:SyncConfig;status:string;onClose:()=>void;onAccountConnect:(endpoint:string,username:string,password:string)=>Promise<void>;onDisconnect:()=>Promise<void>;onExport:()=>Promise<void>;onImport:(text:string)=>void;onLogout:()=>void;username:string;}
export default function Settings({config,status,onClose,onAccountConnect,onDisconnect,onExport,onImport,onLogout,username}:Props){
 const {t,preferences,update}=usePreferences(),[tab,setTab]=useState<'general'|'sync'|'storage'>('general');
 const [endpoint,setEndpoint]=useState(config.endpoint||defaultEndpoint()),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[loginName,setLoginName]=useState(username),[password,setPassword]=useState(''),[storage,setStorage]=useState<StorageInfo|null>(null),[loading,setLoading]=useState(false);
 const file=useRef<HTMLInputElement>(null),synced=!!config.endpoint&&status.startsWith('已同步'),desktop=window.daylightDesktop?.storage;
 useEffect(()=>{if(tab!=='storage'||!desktop)return;let active=true;setLoading(true);desktop.info().then(info=>{if(active){setStorage(info);if(info.error)setError(info.error);}}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[tab]);
 const save=(patch:Partial<Preferences>)=>{if(!update(patch))setError('设置未能保存，请释放本机存储空间后重试。');else setError('');};
 const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(err){setError(err instanceof Error?err.message:String(err));}finally{setBusy(false);}};
 return <Modal title={t('设置')} onClose={onClose} wide><div className="settings-body">
  <nav className="settings-tabs" role="tablist" aria-label={t('设置')}>{([['general','常规'],['sync','同步'],['storage','存储']] as const).map(([id,label])=><button key={id} id={`settings-tab-${id}`} role="tab" aria-selected={tab===id} aria-controls={`settings-panel-${id}`} onClick={()=>{setTab(id);setExpanded(false);setPassword('');setError('');}}>{t(label)}</button>)}</nav>
  <section role="tabpanel" id={`settings-panel-${tab}`} aria-labelledby={`settings-tab-${tab}`} className="settings-panel">
  {tab==='general'&&<>
   <label className="preference-row"><span>{t('语言')}</span><select aria-label={t('语言')} value={preferences.language} onChange={e=>save({language:e.target.value as Preferences['language']})}><option value="zh-CN">简体中文</option><option value="en">English</option></select></label>
   <div className="preference-row"><span>{t('主题')}</span><div className="theme-switch" role="group" aria-label={t('主题')}>{(['light','dark'] as const).map(theme=><button key={theme} aria-pressed={preferences.theme===theme} onClick={()=>save({theme})}>{t(theme==='light'?'浅色':'深色')}</button>)}</div></div>
   <div className="preference-row accent-row"><span>{t('主题色')}</span><div className="accent-options" role="group" aria-label={t('主题色')}>{([['yellow','黄色'],['blue','蓝色'],['peach','蜜桃色']] as const).map(([accent,label])=><button key={accent} data-color={accent} aria-label={t(label)} title={t(label)} aria-pressed={preferences.accent===accent} onClick={()=>save({accent})}>{preferences.accent===accent&&<Check size={18}/>}</button>)}</div></div>
  </>}
  {tab==='sync'&&<>
   <div className={`connection-state ${synced?'is-synced':''}`} role="status">{synced?<Check size={18}/>:<RefreshCw size={18}/>}<span>{t(config.endpoint?status:'离线模式 · 日程保存在这台设备')}</span></div>
   <button className="reconnect-toggle" aria-expanded={expanded} aria-controls="reconnect-form" onClick={()=>{setExpanded(!expanded);setError('');}}><span>{t('重新连接云端')}</span><ChevronDown size={19}/></button>
   {expanded&&<form id="reconnect-form" className="reconnect-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await onAccountConnect(endpoint,loginName,password);onClose();});}}>
    <label className="setting-field">{t('Cloudflare 同步地址')}<input type="url" placeholder="https://your-planner.workers.dev" value={endpoint} onChange={e=>setEndpoint(e.target.value)} required/></label>
    <label className="setting-field">{t('个人账号')}<input autoComplete="username" required maxLength={128} value={loginName} onChange={e=>setLoginName(e.target.value)}/></label>
    <label className="setting-field">{t('账号密码')}<div className="password-field"><input autoComplete="current-password" type={show?'text':'password'} maxLength={1024} placeholder={t('输入账号密码')} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={t(show?'隐藏密码':'显示密码')} className="icon-button" onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
    <div className="setting-actions">{config.endpoint&&<button type="button" className="text-button" disabled={busy} onClick={()=>void run(async()=>{await onDisconnect();onClose();})}><LogOut size={15}/>{t('断开同步')}</button>}<button className="primary-button" disabled={busy} type="submit">{t(busy?'正在连接…':'连接并同步')}<ArrowUpRight size={17}/></button></div>
   </form>}
  </>}
  {tab==='storage'&&<>
   <div className="offline-state"><Check size={17}/><span>{t('离线存储已启用')}</span></div>
   {loading?<p className="storage-note">{t('正在读取存储信息…')}</p>:storage?<>
    <div className="storage-path"><span>{t('数据存储位置')}</span><code>{storage.path}</code></div><div className="storage-path secondary-path"><span>{t('日程数据库')}</span><code>{storage.dataPath}</code></div>
    <div className="storage-size"><span>{t('本地数据大小')}</span><strong>{storage.bytes>=1048576?(storage.bytes/1048576).toFixed(1)+' MB':(storage.bytes/1024).toFixed(1)+' KB'}</strong></div>
    <div className="storage-actions"><button disabled={busy} onClick={()=>void run(async()=>{await desktop!.open();})}><FolderOpen size={18}/>{t('打开文件夹')}</button><button disabled={busy} onClick={()=>void run(async()=>{const info=await desktop!.choose(preferences.language);if(info)setStorage(info);})}><FolderInput size={18}/>{t(busy?'正在选择…':'更换位置')}</button></div>
    {storage.pendingPath&&<div className="storage-pending"><span>{t('待迁移位置')}</span><code>{storage.pendingPath}</code><p>{t('下次启动时迁移已有数据，原目录会保留。')}</p><div><button className="text-button" disabled={busy} onClick={()=>void run(async()=>setStorage(await desktop!.cancel()))}>{t('取消迁移')}</button><button className="primary-button" disabled={busy} onClick={()=>void run(async()=>{await desktop!.restart();})}>{t('重启并迁移')}</button></div></div>}
    <p className="storage-note">{t('软件安装目录与数据目录相互独立。')}</p>
   </>:<p className="storage-note">{t(window.daylightDesktop?.platform==='android'?'日程保存在此应用的专属空间。卸载会删除本机数据，请先同步或导出备份。':'浏览器预览保存在当前浏览器；Windows 版可查看及更换数据文件夹。')}</p>}
   <div className="settings-section storage-backup"><h3>{t('数据与备份')}</h3><div className="backup-buttons"><button disabled={busy} onClick={()=>void run(onExport)}><Download size={18}/><span>{t('导出日程')}<small>{t('保存为 JSON 备份')}</small></span></button><button onClick={()=>file.current?.click()}><Upload size={18}/><span>{t('导入日程')}<small>{t('合并备份中的记录')}</small></span></button></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{const input=e.currentTarget,f=input.files?.[0];try{if(f){if(f.size>25*1024*1024)throw new Error(preferences.language==='en'?'Choose a backup smaller than 25 MB.':'请选择小于 25 MB 的备份文件。');onImport(await f.text());onClose();}}catch(err){setError(err instanceof Error?err.message:'导入失败');}finally{input.value='';}}}/></div>
  </>}
  </section>
  {error&&<p className="form-error" role="alert">{t(error)}</p>}
  <div className="settings-about"><img src="./avatars/notebook-yellow.svg" alt=""/><div><strong>冲冲冲 <span>{__APP_VERSION__}</span></strong></div></div>
  <div className="account-settings"><span>{t('当前账号')} <strong>{username}</strong></span><button className="text-button" onClick={onLogout}><LogOut size={15}/>{t('退出登录')}</button></div>
 </div></Modal>;
}
