import {useEffect,useRef,useState} from 'react';
import {Eye,EyeOff,LockKeyhole,UserRound} from 'lucide-react';
import App from './App';
import {usePreferences} from './lib/preferences';
import {bootstrapCloudSession,cachedAccount,defaultUsername} from './lib/auth';
import './login.css';

export default function AuthApp(){
 const {t}=usePreferences();
 const [signedIn,setSignedIn]=useState(()=>{try{return !!sessionStorage.getItem('liubai.session');}catch{return false;}});
 const [username,setUsername]=useState(defaultUsername),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 const [lockedUntil,setLockedUntil]=useState(0),[now,setNow]=useState(Date.now()),failures=useRef(0);
 useEffect(()=>{void cachedAccount().then(record=>{if(record)setUsername(current=>current||record.username);}).catch(()=>{});},[]);
 useEffect(()=>{if(!lockedUntil)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[lockedUntil]);
 const logout=()=>{sessionStorage.removeItem('liubai.session');setSignedIn(false);setPassword('');setError('');};
 if(signedIn)return <App onLogout={logout} username={sessionStorage.getItem('liubai.session')||username} initialNotice={note}/>;
 const seconds=Math.max(0,Math.ceil((lockedUntil-now)/1000));
 return <div className="login-page"><div className="titlebar" aria-hidden="true"/><main className="login-layout">
  <section className="login-art" aria-label={t("冲冲冲日程本")}>
   <img className="login-art-image" src="./illustrations/login-meadow.png" alt="" draggable={false}/>
  </section>
  <section className="login-form-pane"><div className="login-form-wrap"><h2 className="login-motto is-english">Why Not Do It</h2>
   <form onSubmit={async event=>{event.preventDefault();if(busy||seconds)return;setBusy(true);setError('');try{setNote(await bootstrapCloudSession(username,password));sessionStorage.setItem('liubai.session',username.trim());setPassword('');failures.current=0;setSignedIn(true);}catch(error){failures.current++;setError(error instanceof Error?error.message:'暂时无法登录，请稍后重试。');if(failures.current>=5){setLockedUntil(Date.now()+30000);setNow(Date.now());failures.current=0;}}finally{setBusy(false);}}}>
    <label>{t("账号")}<div className="login-input"><UserRound size={21}/><input autoComplete="username" aria-label={t("登录账号")} required maxLength={128} value={username} onChange={e=>setUsername(e.target.value)}/></div></label>
    <label>{t("密码")}<div className="login-input"><LockKeyhole size={21}/><input autoComplete="current-password" aria-label={t("登录密码")} autoFocus required maxLength={1024} type={visible?'text':'password'} placeholder={t("输入你的密码")} value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={t(visible?'隐藏密码':'显示密码')} onClick={()=>setVisible(!visible)}>{visible?<EyeOff size={21}/>:<Eye size={21}/>}</button></div></label>
    {error&&<p className="login-error" role="alert">{t(error)}</p>}<button className="login-submit" disabled={busy||seconds>0} type="submit"><span>{t(busy?'正在登录…':seconds?`${seconds} 秒后重试`:'登录')}</span></button>
   </form></div></section>
 </main></div>;
}
