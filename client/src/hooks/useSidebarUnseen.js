import {useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {moduleAttentionItems,unseenCounts,markModuleSeen,seenStorageKey,sidebarModule,moduleLoadedBy} from '../../../shared/sidebarUnseen.js';
const read=id=>{try{return JSON.parse(localStorage.getItem(seenStorageKey(id)))||{}}catch{return {}}};
export default function useSidebarUnseen(user,review){
 const location=useLocation(),id=String(user?._id||user?.id||''),[source,setSource]=useState({id,items:null}),[stored,setStored]=useState(()=>({id,seen:read(id)})),[loaded,setLoaded]=useState(null),visit=useRef(null),active=sidebarModule(location.pathname,location.search),visitKey=id+':'+location.key;
 const seen=stored.id===id?stored.seen:read(id),items=moduleAttentionItems(source.id===id?source.items||{}:{},review?.data?.rows||[],user?.role),current=useRef();current.current={id,active,visitKey,page:location.pathname+location.search};
 useEffect(()=>{setSource({id,items:null});setLoaded(null);visit.current=null;const attention=e=>{if(e.detail?.userId===id&&e.detail.counts?.items)setSource({id,items:e.detail.counts?.items||{}})},ready=e=>{const c=current.current;if(c?.id===id&&e.detail?.page===c.page&&moduleLoadedBy(c.active,e.detail?.url))setLoaded(c.visitKey)},storage=e=>{if(e.key===seenStorageKey(id)||e.key===null)setStored({id,seen:read(id)})};window.addEventListener('rems:sidebar-attention',attention);window.addEventListener('rems:module-loaded',ready);window.addEventListener('storage',storage);return()=>{window.removeEventListener('rems:sidebar-attention',attention);window.removeEventListener('rems:module-loaded',ready);window.removeEventListener('storage',storage)}},[id]);
 // Review data is cached centrally, so opening its page need not issue another GET.
 const ready=active==='reviews'&&user?.role==='ADMIN'?!!review?.data:loaded===visitKey;
 const hasSource=active==='reviews'&&user?.role==='ADMIN'?!!review?.data:source.id===id&&source.items!==null&&(user?.role!=='ADMIN'||!!review?.data);
 const previousLocation=useRef(null);
 useEffect(()=>{const old=previousLocation.current;if(old?.page===current.current.page&&old.visitKey!==visitKey&&loaded===old.visitKey)setLoaded(visitKey);previousLocation.current={page:current.current.page,visitKey}},[visitKey,loaded]);
 const signature=JSON.stringify(items[active]||{});
 useEffect(()=>{if(!id||!active||!ready||!hasSource||visit.current===visitKey)return;visit.current=visitKey;setStored(old=>{const fresh=read(id),next=markModuleSeen({...((old.id===id)?old.seen:{}),...fresh},active,items);try{localStorage.setItem(seenStorageKey(id),JSON.stringify(next))}catch{}return {id,seen:next}})},[id,active,ready,hasSource,visitKey,signature]);
 return unseenCounts(items,seen);
}
