import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import {usePreferences} from '../lib/preferences';
export default function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}){
 const {t}=usePreferences();
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;d?.showModal();const frame=requestAnimationFrame(()=>d?.querySelector<HTMLElement>('[data-autofocus]')?.focus());return()=>{cancelAnimationFrame(frame);d?.close();};},[]);
 return <dialog ref={ref} className={`modal ${wide?'wide':''}`} aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label={t("关闭")} onClick={onClose}><X size={20}/></button></header>{children}</dialog>;
}
