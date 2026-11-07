import {useEffect,useRef,useState} from "react";
import {NavLink,Outlet,useLocation} from "react-router-dom";
import NotificationBell from "../components/NotificationBell.jsx";
import HeaderClock from "../components/HeaderClock.jsx";
import NavIcon from "../components/NavIcon.jsx";
import {useAuth} from "../context/AuthContext.jsx";
const groups=[
 {label:"Overview",items:[["/","Dashboard","grid"]]},
 {label:"Management",items:[["/projects","Projects","building"],["/property-inventory","Property Inventory","building"],["/clients","Clients","people"],["/agents","Agents","agent"]]},
 {label:"Finance",items:[["/payment","Payment","wallet"],["/payment-transactions","Payment Transactions","receipt"],["/commissions","Commissions","percent"],["/expenses","Expenses","expense"],["/reports","Reports","chart"]]},
 {label:"Monitoring",items:[["/payment-monitoring","Payment Reminders","bell"],["/approval-requests","Approval Requests","check","ADMIN"]]},
 {label:"Administration",items:[["/users","Users & Activity","settings","ADMIN"]]},
];
export default function AppLayout(){
 const {user,logout}=useAuth(),{pathname}=useLocation(),[open,setOpen]=useState(false),menuButton=useRef(null),sidebar=useRef(null);
 const title=pathname.startsWith("/projects/")?"Manage Lots":groups.flatMap(g=>g.items).find(([to])=>to===pathname)?.[1]||"Workspace";
 const initials=(user?.fullName||user?.username||"User").split(/\s+/).slice(0,2).map(s=>s[0]).join("").toUpperCase();
 const close=()=>{setOpen(false);menuButton.current?.focus()};
 useEffect(()=>{setOpen(false)},[pathname]);
 useEffect(()=>{
  if(!open)return;
  const previous=document.body.style.overflow;document.body.style.overflow="hidden";sidebar.current?.querySelector("button")?.focus();
  const keydown=e=>{
   if(e.key==="Escape"){e.preventDefault();close()}
   if(e.key==="Tab"){
    const targets=[...sidebar.current.querySelectorAll('a[href],button:not([disabled])')].filter(el=>el.getClientRects().length>0),first=targets[0],last=targets.at(-1);
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}
   }
  };
  document.addEventListener("keydown",keydown);return()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keydown)};
 },[open]);
 useEffect(()=>{const mq=window.matchMedia?.("(min-width: 1200px)");const change=e=>{if(e.matches)setOpen(false)};mq?.addEventListener("change",change);return()=>mq?.removeEventListener("change",change)},[]);
 return <div className={`app-shell${open?" menu-open":""}`}>
  <a className="skip-link" href="#workspace-content">Skip to content</a>
  {open&&<button type="button" className="sidebar-backdrop" tabIndex={-1} aria-label="Close navigation overlay" onClick={close}/>}
  <aside ref={sidebar} id="workspace-navigation" className="app-sidebar" role={open?"dialog":undefined} aria-modal={open?true:undefined} aria-label="Main navigation">
   <div className="sidebar-brand"><NavLink to="/" className="brand-link" onClick={()=>setOpen(false)}><span className="brand-symbol"><NavIcon name="building"/></span><span>Property<span className="brand-subtitle">Payment & management</span></span></NavLink><button type="button" className="icon-button sidebar-close" aria-label="Close navigation" onClick={close}><NavIcon name="close"/></button></div>
   <nav className="sidebar-nav" aria-label="Workspace modules">{groups.map(group=>{
    const items=group.items.filter(item=>!item[3]||user?.role===item[3]);if(!items.length)return null;
    return <div className="nav-group" key={group.label}><p className="nav-group-label">{group.label}</p>{items.map(([to,label,icon])=><NavLink end={to==="/"} key={to} to={to} className={({isActive})=>`sidebar-link${isActive?" active":""}`} onClick={()=>setOpen(false)}><NavIcon name={icon}/><span>{label}</span></NavLink>)}</div>
   })}</nav>
   <div className="sidebar-account"><span className="user-avatar" aria-hidden="true">{initials}</span><div className="sidebar-user"><strong>{user?.fullName||user?.username}</strong><span>{user?.role?.toLowerCase()} · {user?.username}</span></div><button type="button" className="icon-button" onClick={logout} aria-label="Logout" title="Logout"><NavIcon name="logout"/></button></div>
  </aside>
  <div className="app-workspace">
   <header className="workspace-header"><div className="workspace-heading"><button ref={menuButton} type="button" className="icon-button menu-toggle" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded={open} onClick={()=>setOpen(true)}><NavIcon name="menu"/></button><div><p className="workspace-eyebrow">Office workspace</p><span className="workspace-title">{title}</span></div></div><div className="workspace-tools"><div className="header-clock"><HeaderClock/><span className="header-timezone">Philippine Standard Time</span></div><NotificationBell/><span className="header-avatar user-avatar" title={user?.fullName} aria-hidden="true">{initials}</span></div></header>
   <div id="workspace-content" className="workspace-content" tabIndex={-1}><Outlet/></div>
  </div>
 </div>;
}
