import {createContext,useContext,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {useLocation,useNavigationType,useNavigate} from 'react-router-dom';
import {useAuth} from './AuthContext.jsx';
import {safeWorkspacePath,recordNavigation,readSession,writeSession,backDestination} from '../utils/navigationHistory.js';
const Context=createContext(null);
export function NavigationHistoryProvider({children}){
 const location=useLocation(),action=useNavigationType(),navigate=useNavigate(),{user}=useAuth(),scope='rems:navigation:'+(user?._id||'guest'),previous=useRef(null),[entries,setEntries]=useState(()=>readSession(scope,{})),entriesRef=useRef(entries),oldScope=useRef(scope);
 useEffect(()=>{const previous=window.history.scrollRestoration;window.history.scrollRestoration='manual';return()=>{window.history.scrollRestoration=previous}},[]);
 const path=location.pathname+location.search+location.hash,current={key:location.key,path,index:window.history.state?.idx};
 useLayoutEffect(()=>{if(oldScope.current!==scope){entriesRef.current=readSession(scope,{});previous.current=null;oldScope.current=scope}const next=recordNavigation(entriesRef.current,previous.current,current,action);entriesRef.current=next;setEntries(next);writeSession(scope,next);if(safeWorkspacePath(path))previous.current=current;else previous.current=null},[location.key,path,scope,action]);
 useEffect(()=>{if(!user)return;const key=`${scope}:scroll:${location.key}`,point=readSession(key,null);let cancelled=false,frame,observer;const root=()=>document.getElementById('workspace-content');
 let restoring=!!point;const restore=()=>{if(cancelled||!restoring)return;window.scrollTo(point.x||0,point.y||0);if(root()){root().scrollLeft=point.left||0;root().scrollTop=point.top||0}};
 const stop=()=>{restoring=false;observer?.disconnect()};
 if(point){frame=requestAnimationFrame(restore);observer=new MutationObserver(restore);observer.observe(document.body,{childList:true,subtree:true})}else window.scrollTo(0,0);
 const save=()=>{if(restoring)return;writeSession(key,{x:window.scrollX,y:window.scrollY,left:root()?.scrollLeft||0,top:root()?.scrollTop||0})};
 const interaction=()=>{stop();save()};window.addEventListener('wheel',interaction,{passive:true});window.addEventListener('touchstart',interaction,{passive:true});window.addEventListener('pointerdown',interaction);window.addEventListener('keydown',interaction);window.addEventListener('scroll',save,{passive:true});document.addEventListener('scroll',save,{passive:true,capture:true});window.addEventListener('pagehide',save);
 return()=>{cancelled=true;cancelAnimationFrame(frame);observer?.disconnect();window.removeEventListener('wheel',interaction);window.removeEventListener('touchstart',interaction);window.removeEventListener('pointerdown',interaction);window.removeEventListener('keydown',interaction);window.removeEventListener('scroll',save);document.removeEventListener('scroll',save,true);window.removeEventListener('pagehide',save)};
 },[location.key,user?._id,scope]);
 const back=(fallback='/')=>{const target=backDestination(entriesRef.current[location.key],window.history.state?.idx,fallback);if(target.path===path)return;target.delta!==null?navigate(target.delta):navigate(target.path,{replace:true})};
 return <Context.Provider value={{entry:entries[location.key],back,currentIndex:window.history.state?.idx,scope,entryKey:location.key}}>{children}</Context.Provider>;
}
export const useNavigationHistory=()=>useContext(Context);
