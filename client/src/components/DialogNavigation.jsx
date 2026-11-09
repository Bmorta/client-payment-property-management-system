import {topDialog} from "../utils/dialogStack.js";
import {useEffect} from 'react';
import {useLocation} from 'react-router-dom';
import {revealTarget} from '../utils/navigation.js';
export default function DialogNavigation(){
 const location=useLocation();
 useEffect(()=>{let ready=false,done=false;const reveal=()=>{if(!ready||done||document.querySelector('[aria-modal="true"]'))return;const heading=document.querySelector('main h1');if(heading){revealTarget(heading);done=true;observer.disconnect()}};const observer=new MutationObserver(reveal);observer.observe(document.body,{childList:true,subtree:true});const timer=setTimeout(()=>{ready=true;reveal()},100);return()=>{clearTimeout(timer);observer.disconnect()}},[location.pathname,location.search]);
 useEffect(()=>{
  const stack=new Map();let locked=false,previousOverflow="";
  const dialogs=()=>[...document.querySelectorAll('[aria-modal="true"]:not(.app-sidebar)')];
  const sync=()=>{const current=dialogs();if(current.length&&!locked){previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";locked=true}else if(!current.length&&locked){document.body.style.overflow=previousOverflow;locked=false}for(const [dialog,previous] of stack)if(!current.includes(dialog)){stack.delete(dialog);if(previous?.isConnected&&(!topDialog()||topDialog().contains(previous)))previous.focus({preventScroll:true})}for(const dialog of current)if(!stack.has(dialog)){stack.set(dialog,document.activeElement);if(topDialog()!==dialog)continue;const first=dialog.querySelector('input:not([readonly]):not([disabled]),select:not([disabled]),textarea:not([disabled])')||[...dialog.querySelectorAll('button:not([disabled])')].find(b=>/^(Cancel|Close|OK|Keep Editing)/i.test(b.textContent.trim()));first?.focus({preventScroll:true})}};
  const observer=new MutationObserver(sync);observer.observe(document.body,{childList:true,subtree:true});sync();
  const key=e=>{if(e.defaultPrevented)return;if(e.key==='Escape'&&document.querySelector('[role=tooltip]'))return;const dialog=topDialog();if(!dialog)return;const controls=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
   if(e.key==='Tab'&&controls.length){if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus()}}
   if(e.key==='Escape'){const cancel=controls.find(b=>b.tagName==='BUTTON'&&/^(Cancel|Close|Keep Editing|Back|Go Back)/i.test(b.textContent.trim()));if(cancel){e.preventDefault();e.stopPropagation();cancel.click()}else if(dialog.dataset.informational==='true'){e.preventDefault();dialog.querySelector('button')?.click()}}
   if(['Enter',' '].includes(e.key)&&dialog.dataset.informational==='true'&&!e.target.closest('input,textarea,select,button,a')){e.preventDefault();dialog.querySelector('button')?.click()}
  };document.addEventListener('keydown',key);return()=>{observer.disconnect();document.removeEventListener('keydown',key);if(locked)document.body.style.overflow=previousOverflow};
 },[]);
 return null;
}
