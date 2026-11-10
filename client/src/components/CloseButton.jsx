import {topDialog,dialogControls} from "../utils/dialogStack.js";
import {useEffect,useRef} from 'react';
import NavIcon from './NavIcon.jsx';
export default function CloseButton({onClick,disabled=false,label='Close dialog',className=''}){
 const ref=useRef(null),handler=useRef(onClick);handler.current=onClick;
 useEffect(()=>{const dialog=ref.current?.closest('[role="dialog"],[role="alertdialog"]');if(!dialog)return;const previous=document.activeElement;if(topDialog()===dialog)ref.current.focus();const key=e=>{const top=topDialog();if(top!==dialog||e.defaultPrevented)return;if(e.key==='Escape'&&!ref.current?.disabled){e.preventDefault();e.stopPropagation();handler.current?.()}if(e.key==='Tab'){const items=dialogControls(dialog);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}};document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);if(previous?.isConnected&&(!topDialog()||topDialog().contains(previous)))previous.focus()}},[]);
 return <button ref={ref} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={`dialog-close icon-button ${className}`}><NavIcon name="close"/></button>
}
