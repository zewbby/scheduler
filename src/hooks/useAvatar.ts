import {useCallback,useEffect,useRef,useState} from 'react';
import {DEFAULT_AVATAR,validProfile,type AvatarProfile} from '../lib/avatar';
import {getToken,normalizedEndpoint} from '../lib/sync';
function load(){try{const value=JSON.parse(localStorage.getItem('liubai.avatar')||'null');return validProfile(value)?value:DEFAULT_AVATAR;}catch{return DEFAULT_AVATAR;}}
function loadPending(){try{return localStorage.getItem('liubai.avatar.pending')==='true';}catch{return false;}}
export function useAvatar(endpoint:string){
 const [profile,setProfile]=useState(load),[avatarPending,setAvatarPending]=useState(loadPending),current=useRef(profile),pending=useRef(avatarPending),running=useRef(false),generation=useRef(0);
 const persist=(value:AvatarProfile,dirty:boolean)=>{try{localStorage.setItem('liubai.avatar',JSON.stringify(value));localStorage.setItem('liubai.avatar.pending',String(dirty));current.current=value;pending.current=dirty;setProfile(value);setAvatarPending(dirty);return true;}catch{return false;}};
 const sync=useCallback(async()=>{if(!endpoint||running.current)return;running.current=true;const gen=generation.current;try{const token=await getToken();if(!token||gen!==generation.current)return;const snapshot=current.current,dirty=pending.current;const response=await fetch(`${normalizedEndpoint(endpoint)}/api/profile`,{method:dirty?'PUT':'GET',headers:{Authorization:`Bearer ${token}`,...(dirty?{'Content-Type':'application/json'}:{})},body:dirty?JSON.stringify(snapshot):undefined,signal:AbortSignal.timeout(12000)});if(!response.ok)return;const value=await response.json();if(gen!==generation.current||!validProfile(value)||current.current.updatedAt!==snapshot.updatedAt)return;if(value.updatedAt>=snapshot.updatedAt)persist(value,false);}catch{/* Pending avatar edits are retained for retry. */}finally{running.current=false;}},[endpoint]);
 useEffect(()=>{generation.current++;const timer=setTimeout(()=>void sync(),1800),interval=setInterval(()=>void sync(),60000);const online=()=>void sync(),visible=()=>{if(document.visibilityState==='visible')void sync();};window.addEventListener('online',online);window.addEventListener('focus',online);document.addEventListener('visibilitychange',visible);return()=>{generation.current++;clearTimeout(timer);clearInterval(interval);window.removeEventListener('online',online);window.removeEventListener('focus',online);document.removeEventListener('visibilitychange',visible);};},[sync]);
 useEffect(()=>{if(pending.current){const timer=setTimeout(()=>void sync(),600);return()=>clearTimeout(timer);}},[profile.updatedAt,sync]);
 const select=(avatarId:string,image:string|null)=>persist({avatarId,image,updatedAt:Math.max(Date.now(),current.current.updatedAt+1)},true);
 return {profile,select,pending:avatarPending};
}
