export const AVATARS=[{id:'notebook-yellow',label:'向前冲',url:'./avatars/notebook-yellow.svg'},{id:'notebook-blue',label:'小蓝本',url:'./avatars/notebook-blue.svg'},{id:'notebook-peach',label:'灵感本',url:'./avatars/notebook-peach.svg'}] as const;
export interface AvatarProfile{avatarId:string;image:string|null;updatedAt:number;}
export const DEFAULT_AVATAR:AvatarProfile={avatarId:'notebook-yellow',image:null,updatedAt:0};
export function avatarUrl(profile:AvatarProfile):string{return profile.avatarId==='custom'&&profile.image?profile.image:AVATARS.find(a=>a.id===profile.avatarId)?.url||AVATARS[0].url;}
export function validProfile(value:unknown):value is AvatarProfile{if(!value||typeof value!=='object')return false;const p=value as AvatarProfile;return (AVATARS.some(a=>a.id===p.avatarId)&&p.image===null||p.avatarId==='custom'&&typeof p.image==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)&&p.image.length<=180000)&&Number.isSafeInteger(p.updatedAt)&&p.updatedAt>=0;}
export async function prepareAvatar(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('请选择 5 MB 以内的 PNG、JPG 或 WebP 图片。');
 const bitmap=await createImageBitmap(file);try{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const context=canvas.getContext('2d');if(!context)throw new Error('图片暂时无法处理，请换一张图片。');const size=Math.min(bitmap.width,bitmap.height);context.drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,256,256);const image=canvas.toDataURL('image/webp',.85);if(image.length>180000)throw new Error('图片内容过大，请换一张较简单的图片。');return image;}finally{bitmap.close();}
}
