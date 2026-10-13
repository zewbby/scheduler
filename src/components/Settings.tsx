import {useRef,useState} from 'react';
import {Cloud,Download,Upload,ArrowUpRight,Check,Eye,EyeOff,LogOut,ChevronDown} from 'lucide-react';
import Modal from './Modal';
import {defaultEndpoint,type SyncConfig} from '../lib/sync';
declare const __APP_VERSION__:string;
interface Props{config:SyncConfig;status:string;onClose:()=>void;onAccountConnect:(endpoint:string,username:string,password:string)=>Promise<void>;onDisconnect:()=>Promise<void>;onExport:()=>void;onImport:(text:string)=>void;onLogout:()=>void;username:string;}
export default function Settings({config,status,onClose,onAccountConnect,onDisconnect,onExport,onImport,onLogout,username}:Props){
 const [endpoint,setEndpoint]=useState(config.endpoint||defaultEndpoint()),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[expanded,setExpanded]=useState(false),[loginName,setLoginName]=useState(username),[password,setPassword]=useState('');
 const file=useRef<HTMLInputElement>(null),synced=!!config.endpoint&&status.startsWith('已同步');
 return <Modal title="设置" onClose={onClose} wide><div className="settings-body">
  <div className="settings-intro"><div className="settings-icon"><Cloud size={25}/></div><div><h3>时间，在每一处相连。</h3><p>你的日程，自动在设备之间同步。</p></div></div>
  <div className={`connection-state ${synced?'is-synced':''}`} role="status">{synced?<Check size={18}/>:<Cloud size={18}/>}<span>{config.endpoint?status:'离线模式 · 日程保存在这台设备'}</span></div>
  <button className="reconnect-toggle" aria-expanded={expanded} aria-controls="reconnect-form" onClick={()=>{setExpanded(!expanded);setError('');}}><span>重新连接云端</span><ChevronDown size={19}/></button>
  {expanded&&<form id="reconnect-form" className="reconnect-form" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await onAccountConnect(endpoint,loginName,password);onClose();}catch(err){setError(err instanceof Error?err.message:'连接失败，请检查地址与网络。');}finally{setBusy(false);}}}>
   <label className="setting-field">Cloudflare 同步地址<input type="url" placeholder="https://your-planner.workers.dev" value={endpoint} onChange={e=>setEndpoint(e.target.value)} required/></label>
   <label className="setting-field">个人账号<input autoComplete="username" required maxLength={128} value={loginName} onChange={e=>setLoginName(e.target.value)}/></label>
   <label className="setting-field">账号密码<div className="password-field"><input autoComplete="current-password" type={show?'text':'password'} maxLength={1024} placeholder="输入账号密码" value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" aria-label={show?'隐藏密码':'显示密码'} className="icon-button" onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>
   <div className="setting-actions">{config.endpoint&&<button type="button" className="text-button" disabled={busy} onClick={async()=>{setBusy(true);try{await onDisconnect();onClose();}catch(err){setError(err instanceof Error?err.message:'断开失败，请重试。');}finally{setBusy(false);}}}><LogOut size={15}/>断开同步</button>}<button className="primary-button" disabled={busy} type="submit">{busy?'正在连接…':'连接并同步'}<ArrowUpRight size={17}/></button></div>
  </form>}
  {error&&<p className="form-error" role="alert">{error}</p>}
  <div className="settings-section"><h3>数据与备份</h3><p>一份独立的副本，让记录更安心。</p><div className="backup-buttons"><button onClick={onExport}><Download size={18}/><span>导出日程<small>保存为 JSON 备份</small></span></button><button onClick={()=>file.current?.click()}><Upload size={18}/><span>导入日程<small>合并备份中的记录</small></span></button></div><input ref={file} type="file" accept=".json,application/json" hidden onChange={async e=>{const input=e.currentTarget,f=input.files?.[0];try{if(f){if(f.size>25*1024*1024)throw new Error('请选择小于 25 MB 的备份文件。');onImport(await f.text());onClose();}}catch(err){setError(err instanceof Error?err.message:'导入失败');}finally{input.value='';}}}/></div>
  <div className="settings-about"><img src="./avatars/notebook-yellow.svg" alt=""/><div><strong>冲冲冲 <span>{__APP_VERSION__}</span></strong><p>每一天，一张卡片。</p></div></div>
  <div className="account-settings"><span>当前账号 <strong>{username}</strong></span><button className="text-button" onClick={onLogout}><LogOut size={15}/>退出登录</button></div>
 </div></Modal>;
}
