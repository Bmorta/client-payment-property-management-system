import {topDialog} from '../utils/dialogStack.js';
import AppearanceSelect from '../components/AppearanceSelect.jsx';
import REMSIcon from "../components/REMSIcon.jsx";
import {useEffect,useRef,useState} from "react";
import {Link,NavLink,Outlet,useLocation} from "react-router-dom";
import NotificationBell from "../components/NotificationBell.jsx";
import HeaderClock from "../components/HeaderClock.jsx";
import NavIcon from "../components/NavIcon.jsx";
import {useAuth} from "../context/AuthContext.jsx";
import {visibleGroups,activeDestination} from "../utils/workspaceNavigation.js";
const readPreference=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
export default function AppLayout(){
 const {user,logout}=useAuth(),location=useLocation(),{pathname,search}=location,[open,setOpen]=useState(false),menuButton=useRef(null),sidebar=useRef(null);
 const groups=visibleGroups(user?.role),active=activeDestination(location),activeGroup=groups.find(g=>g.items.some(i=>i.to===active));
 const [peek,setPeek]=useState(false),[compact,setCompact]=useState(()=>readPreference('rems:compact',false)),[expanded,setExpanded]=useState(()=>readPreference('rems:groups',{}));
 const title=pathname.startsWith('/projects/')?'Manage Lots':groups.flatMap(g=>g.items).find(i=>i.to===active)?.label||'Workspace';
 useEffect(()=>{try{localStorage.setItem('rems:compact',JSON.stringify(compact));localStorage.setItem('rems:groups',JSON.stringify(expanded))}catch{}},[compact,expanded]);
 useEffect(()=>{if(activeGroup)setExpanded(old=>({...old,[activeGroup.id]:true}))},[activeGroup?.id,active]);
 const initials=(user?.fullName||user?.username||"User").split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
 const close=()=>{setOpen(false);menuButton.current?.focus()};
 useEffect(()=>{setOpen(false);setPeek(false)},[pathname,search]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";sidebar.current?.querySelector("button")?.focus();
  const keydown=e=>{
   if(e.defaultPrevented||topDialog())return;
   if(e.key==="Escape"){e.preventDefault();close()}
   if(e.key==="Tab"){
    const targets=[...sidebar.current.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length>0),first=targets[0],last=targets.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
   }
  };
  document.addEventListener("keydown",keydown);return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keydown)};
 },[open]);
 useEffect(()=>{
  if(!compact||open)return;
  const dismiss=e=>{if(e.key==="Escape"&&sidebar.current?.contains(document.activeElement)){setPeek(false);document.getElementById("workspace-content")?.focus()}};
  const outside=e=>{if(!sidebar.current?.contains(e.target))setPeek(false)};
  document.addEventListener("keydown",dismiss);document.addEventListener("pointerdown",outside);return()=>{document.removeEventListener("keydown",dismiss);document.removeEventListener("pointerdown",outside)};
 },[compact,open]);
 useEffect(()=>{const mq=window.matchMedia?.("(min-width: 1200px)");const change=e=>{if(e.matches)setOpen(false)};mq?.addEventListener("change",change);return()=>mq?.removeEventListener("change",change)},[]);
 return <div className={`app-shell${open?" menu-open":""}${compact?" sidebar-compact":""}${compact&&peek?" sidebar-peek":""}`}>
  <a className="skip-link" href="#workspace-content">Skip to content</a>
  {open&&<button type="button" className="sidebar-backdrop" tabIndex={-1} aria-label="Close navigation overlay" onClick={close}/>}
  <aside ref={sidebar} id="workspace-navigation" className="app-sidebar" role={open?"dialog":undefined} aria-modal={open?true:undefined} aria-label="Main navigation" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setPeek(false)}}>
   <div className="sidebar-brand"><NavLink to="/" className="brand-link" onClick={()=>setOpen(false)}><REMSIcon size={40} decorative/><span className="brand-copy">REMS<span className="brand-subtitle">Real Estate Management System</span></span></NavLink><button type="button" className="icon-button sidebar-close" aria-label="Close navigation" onClick={close}><NavIcon name="close"/></button></div>
   <button type="button" className="desktop-collapse" aria-label={compact?'Expand sidebar':'Collapse sidebar'} aria-pressed={compact} onClick={()=>{setPeek(false);setCompact(v=>!v)}}><NavIcon name="menu"/><span>{compact?'Expand':'Collapse sidebar'}</span></button>
   <nav className="sidebar-nav" aria-label="Workspace modules">{groups.map(group=>{
    const isOpen=expanded[group.id]??group.id===activeGroup?.id;
    return <div className={`nav-group${isOpen?' group-open':''}${activeGroup?.id===group.id?' group-active':''}`} key={group.id}>
     <button type="button" className="nav-category" aria-label={group.label} aria-expanded={!!isOpen} aria-controls={`nav-${group.id}`} title={group.label} onClick={()=>{if(compact&&!open){setPeek(true);setExpanded(old=>({...old,[group.id]:true}))}else setExpanded(old=>({...old,[group.id]:!isOpen}))}}><NavIcon name={group.icon}/><span>{group.label}</span><span className="nav-chevron" aria-hidden="true">{isOpen?'−':'+'}</span></button>
     <div className="nav-items" id={`nav-${group.id}`}><span className="flyout-label">{group.label}</span>{group.items.map(({to,label,icon})=><Link key={to} to={to} aria-current={active===to?'page':undefined} className={`sidebar-link${active===to?' active':''}`} onClick={()=>{setOpen(false);setPeek(false)}}><NavIcon name={icon}/><span>{label}</span></Link>)}</div>
    </div>
   })}</nav>
   <div className="sidebar-account"><span className="user-avatar" aria-hidden="true">{initials}</span><div className="sidebar-user"><strong>{user?.fullName||user?.username}</strong><span>{user?.role?.toLowerCase()} · {user?.username}</span></div><button type="button" className="icon-button" onClick={logout} aria-label="Logout" title="Logout"><NavIcon name="logout"/></button></div>
  </aside>
  <div className="app-workspace">
   <header className="workspace-header"><div className="workspace-heading"><button ref={menuButton} type="button" className="icon-button menu-toggle" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={open} onClick={()=>setOpen(true)}><NavIcon name="menu"/></button><div><p className="workspace-eyebrow">REMS · Office workspace</p><span className="workspace-title">{title}</span></div></div><div className="workspace-tools"><div className="header-clock"><HeaderClock/><span className="header-timezone">Philippine Standard Time</span></div><AppearanceSelect compact/><NotificationBell/><span className="header-avatar user-avatar" title={user?.fullName} aria-hidden="true">{initials}</span></div></header>
   <div id="workspace-content" className="workspace-content" tabIndex={-1}><Outlet/></div>
  </div>
 </div>;
}
