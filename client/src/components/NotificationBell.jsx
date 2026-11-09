import {useEffect,useState} from "react";
import {createPortal} from 'react-dom';
import {useNavigate} from "react-router-dom";
import api from "../services/api.js";
import {useAuth} from "../context/AuthContext.jsx";
import CloseButton from './CloseButton.jsx';
import FeedbackMessage from './FeedbackMessage.jsx';
import Pagination from './Pagination.jsx';
import {manilaTimestamp} from '../utils/manilaTime.js';
export default function NotificationBell(){
 const {user}=useAuth(),navigate=useNavigate(),[data,setData]=useState({rows:[],unread:0}),[open,setOpen]=useState(false),[connected,setConnected]=useState(false),[error,setError]=useState('');
 const [history,setHistory]=useState(null),[page,setPage]=useState(1),[limit,setLimit]=useState(25),[q,setQ]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const controller=new AbortController();let timer,active=true,last="";
  const connect=async()=>{try{const response=await fetch(`${api.defaults.baseURL}/finance/notifications/stream`,{headers:{Authorization:`Bearer ${localStorage.getItem("cpm_access_token")}`},signal:controller.signal});if(!response.ok)throw Error("Connection failed");if(active)setConnected(true);const reader=response.body.getReader(),decoder=new TextDecoder();let buffer="";while(active){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf("\n\n"))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);if(event.startsWith("data: ")){const next=JSON.parse(event.slice(6));if(active){setData(next);if(last&&last!==event)window.dispatchEvent(new CustomEvent("cpm:notifications"));last=event}}}}}catch(e){if(e.name==="AbortError")return}if(active){setConnected(false);timer=setTimeout(connect,5000)}};
  connect();return()=>{active=false;clearTimeout(timer);controller.abort()};
 },[user._id]);
 useEffect(()=>{setPage(1)},[q,limit]);
 useEffect(()=>{if(!open)return;let active=true;const timer=setTimeout(()=>api.get('/finance/notifications',{params:{page,limit,q}}).then(r=>{if(active){setHistory(r.data.data);setError('')}}).catch(e=>{if(active)setError(e.response?.data?.message||'Unable to load notification history.')}),150);return()=>{active=false;clearTimeout(timer)}},[open,page,limit,q,data.version]);
 const read=async n=>{if(busy)return;setBusy(true);try{const {data:result}=await api.post(n?`/finance/notifications/${encodeURIComponent(n.id)}/read`:'/finance/notifications/read-all',n?{accountId:n.accountId}:{});setData(result.data);setError('');if(n){setOpen(false);navigate(n.commissionAlert?n.href:!n.monitoringAlert&&user.role==='ADMIN'?'/approval-requests':`/payment?account=${n.accountId}`)}}catch(e){setError(e.response?.data?.message||'Unable to mark notifications read. Please retry.')}finally{setBusy(false)}};
 return <><button className="btn btn-outline-secondary text-nowrap" aria-label={`Notifications: ${data.unread} unread`} aria-expanded={open} onClick={()=>{setPage(1);setOpen(true)}}>Notifications {data.unread>0&&<span className="badge text-bg-danger">{data.unread}</span>}</button>
 {open&&createPortal(<div className="position-fixed top-0 start-0 w-100 h-100 p-3 d-flex align-items-center justify-content-center" style={{zIndex:6000,background:'#0008'}}><section className="card shadow w-100" style={{maxWidth:700,maxHeight:'85dvh',overflowY:'auto'}} role="dialog" aria-modal="true" aria-label="Notification history"><div className="card-body"><div className="section-heading"><h2 className="h5">Notifications</h2><CloseButton onClick={()=>setOpen(false)}/></div><FeedbackMessage kind="error" message={error}/><p className="small text-secondary">{connected?'Live updates connected':'Reconnecting automatically…'} · {data.unread} unread across all permitted notifications.</p><label className="form-label w-100">Search notification history<input className="form-control" maxLength={100} value={q} onChange={e=>setQ(e.target.value)}/></label><button disabled={busy} className="btn btn-outline-primary btn-sm mb-2" onClick={()=>read()}>Mark all as read</button><p className="small">Includes older pages. Reading notifications does not change payment or commission balances.</p>
 {!history?<p role="status">Loading notifications…</p>:<>{!history.rows.length?<p>No matching notifications.</p>:history.rows.map(n=><button disabled={busy} className={`btn text-start w-100 border-bottom rounded-0 ${n.read?'':'fw-bold'}`} key={`${n.accountId}:${n.id}`} onClick={()=>read(n)}>{n.message}<div className="small text-secondary">{manilaTimestamp(n.createdAt)} · {n.read?'Read':'Unread'}</div></button>)}<Pagination page={page} limit={limit} total={history.total} onPage={setPage} onLimit={setLimit}/></>}
 </div></section></div>,document.body)}</>;
}
