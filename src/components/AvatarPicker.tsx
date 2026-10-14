import {useRef,useState} from 'react';
import {Check,Upload} from 'lucide-react';
import Modal from './Modal';
import {usePreferences} from '../lib/preferences';
import {AVATARS,avatarUrl,prepareAvatar,type AvatarProfile} from '../lib/avatar';
export default function AvatarPicker({profile,username,onClose,onSelect}:{profile:AvatarProfile;username:string;onClose:()=>void;onSelect:(avatarId:string,image:string|null)=>boolean}){
 const {t}=usePreferences();
 const upload=useRef<HTMLInputElement>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 return <Modal title={t("换个头像")} onClose={onClose} wide><div className="avatar-picker"><div className="avatar-current"><img src={avatarUrl(profile)} alt={t("当前头像")}/><div><strong>{username}</strong><p>{t("挑一本喜欢的，陪你冲。")}</p></div></div><div className="avatar-options">{AVATARS.map(avatar=><button key={avatar.id} aria-label={t(`选择${avatar.label}头像`)} aria-pressed={profile.avatarId===avatar.id} onClick={()=>{if(onSelect(avatar.id,null))onClose();else setError('头像未能保存，请释放本机存储空间后再试。');}}><img src={avatar.url} alt={t(avatar.label)}/><span>{t(avatar.label)}</span>{profile.avatarId===avatar.id&&<Check className="avatar-picked" size={17}/>}</button>)}</div><button className="avatar-upload" onClick={()=>upload.current?.click()} disabled={busy}><Upload size={19}/>{t(busy?'正在处理…':'上传自己的头像')}</button><input ref={upload} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setError('');try{const image=await prepareAvatar(file);if(!onSelect('custom',image))throw new Error('头像未能保存，请释放本机存储空间后再试。');onClose();}catch(error){setError(error instanceof Error?error.message:'图片无法读取，请换一张图片。');}finally{setBusy(false);e.target.value='';}}}/>{error&&<p className="form-error" role="alert">{t(error)}</p>}</div></Modal>;
}
