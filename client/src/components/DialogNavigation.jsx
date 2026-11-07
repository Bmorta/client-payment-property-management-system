import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {revealTarget} from '../utils/navigation.js';
export default function DialogNavigation(){
 const location=useLocation();
 useEffect(()=>{let ready=false,done=false;const reveal=()=>{if(!ready||done||document.querySelector('[aria-modal="true"]'))return;const heading=document.querySelector('main h1');if(heading){revealTarget(heading);done=true;observer.disconnect()}};const observer=new MutationObserver(reveal);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{ready=true;reveal()},100);return()=>{clearTimeout(timer);observer.disconnect()}},[location.pathname,location.search]);
 useEffect(()=>{
  const stack=new Map();
  const dialogs=()=>[...document.querySelectorAll('[aria-modal="true"]:not(.app-sidebar)')];
  const sync=()=>{const current=dialogs();for(const [dialog,previous] of stack)if(!current.includes(dialog)){stack.delete(dialog);if(previous?.isConnected)previous.focus({preventScroll:true})}for(const dialog of current)if(!stack.has(dialog)){stack.set(dialog,document.activeElement);const first=dialog.querySelector('input:not([readonly]):not([disabled]),select:not([disabled]),textarea:not([disabled])')||[...dialog.querySelectorAll('button:not([disabled])')].find(b=>/^(Cancel|Close|OK|Keep Editing)/i.test(b.textContent.trim()));first?.focus({preventScroll:true})}};
  const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();
  const key=e=>{if(e.key==='Escape'&&document.querySelector('[role=tooltip]'))return;const dialog=dialogs().at(-1);if(!dialog)return;const controls=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
   if(e.key==='Tab'&&controls.length){if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus()}}
   if(e.key==='Escape'){const cancel=controls.find(b=>b.tagName==='BUTTON'&&/^(Cancel|Close|Keep Editing|Back|Go Back)/i.test(b.textContent.trim()));if(cancel){e.preventDefault();e.stopPropagation();cancel.click()}else if(dialog.dataset.informational==='true'){e.preventDefault();dialog.querySelector('button')?.click()}}
   if(['Enter',' '].includes(e.key)&&dialog.dataset.informational==='true'&&!e.target.closest('input,textarea,select,button,a')){e.preventDefault();dialog.querySelector('button')?.click()}
  };document.addEventListener('keydown',key);return()=>{observer.disconnect();document.removeEventListener('keydown',key)};
 },[]);
 return null;
}
