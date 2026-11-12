import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {visibleGroups} from '../utils/workspaceNavigation.js';
import {useAuth} from '../context/AuthContext.jsx';
import NavIcon from './NavIcon.jsx';

const extra=[
 {label:'Manage Lots',to:'/projects',aliases:'lot configuration edit lots'},
 {label:'Reopen Lot',to:'/reopen-properties',aliases:'reopen properties lot selling'},
 {label:'Accept Payment',to:'/payment',aliases:'record payment cashier'},
 {label:'Contract Forfeiture',to:'/forfeited-accounts',aliases:'forfeiture review approve',roles:['ADMIN']},
 {label:'Assume Contract',to:'/assumptions',aliases:'assumption buyer takeover',roles:['ADMIN','STAFF']},
 {label:'Commission Assignment',to:'/commissions',aliases:'configure property commission',roles:['ADMIN']},
 {label:'Commission Register',to:'/commissions',aliases:'agent commissions payout'},
 {label:'Penalty Monitoring',to:'/payment-monitoring',aliases:'overdue penalties risk'},
 {label:'Cash Management',to:'/reports?view=cash&focus=movements',aliases:'turnover cash added office cash'},
];
export default function FeatureSearch(){const {user}=useAuth(),navigate=useNavigate(),input=useRef(null),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0);
 const options=useMemo(()=>{const allowed=visibleGroups(user?.role).flatMap(g=>g.items.map(i=>({label:i.label,to:i.to,aliases:i.label.toLowerCase()})));for(const row of extra)if((!row.roles||row.roles.includes(user?.role))&&!allowed.some(i=>i.to===row.to&&i.label===row.label))allowed.push(row);const q=query.trim().toLowerCase();return q?allowed.filter(i=>`${i.label} ${i.aliases||''} ${i.to}`.toLowerCase().includes(q)).slice(0,8):allowed.slice(0,8)},[user?.role,query]);
 useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setOpen(true);setQuery('');setActive(0)}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[]);
 useEffect(()=>{if(open)input.current?.focus()},[open]);
 const go=index=>{const row=options[index];if(!row)return;navigate(row.to);setOpen(false);setQuery('')};
 const keyDown=e=>{if(e.key==='Escape'){e.preventDefault();setOpen(false)}else if(e.key==='ArrowDown'){e.preventDefault();setActive(i=>Math.min(i+1,options.length-1))}else if(e.key==='ArrowUp'){e.preventDefault();setActive(i=>Math.max(0,i-1))}else if(e.key==='Enter'){e.preventDefault();go(active)}};
 return <><button type="button" className="feature-search-trigger" aria-label="Search a feature" title="Search a feature (Ctrl+K)" onClick={()=>{setOpen(true);setQuery('')}}><NavIcon name="search"/><span>Search a feature…</span><kbd>Ctrl K</kbd></button>{open&&<div className="feature-search-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="feature-search-dialog" role="dialog" aria-modal="true" aria-label="Search REMS features"><div className="feature-search-input-wrap"><NavIcon name="search"/><input ref={input} value={query} onChange={e=>{setQuery(e.target.value);setActive(0)}} onKeyDown={keyDown} placeholder="Search a feature…" aria-label="Search a feature" aria-controls="feature-search-results"/><button type="button" className="icon-button" onClick={()=>setOpen(false)} aria-label="Close search"><NavIcon name="close"/></button></div><div id="feature-search-results" role="listbox" className="feature-search-results">{options.map((row,i)=><button type="button" key={`${row.to}:${row.label}`} role="option" aria-selected={i===active} className={`feature-search-option${i===active?' active':''}`} onMouseEnter={()=>setActive(i)} onClick={()=>go(i)}><span>{row.label}</span><span className="small text-secondary">Open</span></button>)}{!options.length&&<p className="small text-secondary p-3 mb-0">No matching features for your account.</p>}</div><div className="feature-search-hint">Use ↑ ↓ to move · Enter to open · Esc to close</div></section></div>}</>;
}
