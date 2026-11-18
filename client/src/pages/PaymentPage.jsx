import {ReservationPayment} from '../components/Reservations.jsx';
import NavIcon from '../components/NavIcon.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {localDate} from '../utils/finance.js';
import './payment-workstation.css';
import FeedbackMessage from "../components/FeedbackMessage.jsx";
import PaymentPenaltyBasis from "../components/PaymentPenaltyBasis.jsx";
import {useEffect,useState} from 'react';
import {Link,Navigate,useSearchParams} from 'react-router-dom';
import api from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import ClientLookup from '../components/ClientLookup.jsx';
import ClientSearchModal from '../components/ClientSearchModal.jsx';
import PropertyPaymentCheckout from '../components/PropertyPaymentCheckout.jsx';
import PropertyPaymentDetails from '../components/PropertyPaymentDetails.jsx';
import AccountMonitoringDetails from '../components/AccountMonitoringDetails.jsx';
import PropertyPaymentHistory from '../components/PropertyPaymentHistory.jsx';
import PenaltyMonitoring from '../components/PenaltyMonitoring.jsx';
import {clientName,lotName} from '../utils/finance.js';
export default function PaymentPage(){const {user}=useAuth(),[params,setParams]=useSearchParams(),initial=params.get('account')||'',[client,setClient]=useState(null),[accounts,setAccounts]=useState([]),[search,setSearch]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[version,setVersion]=useState(0),[monitoring,setMonitoring]=useState(false);
 useEffect(()=>{let active=true;if(initial){setLoading(true);api.get(`/finance/accounts/${initial}`).then(r=>{if(active)setClient(r.data.data.client)}).catch(e=>{if(active)setError(e.response?.data?.message||'Unable to load account.')}).finally(()=>{if(active)setLoading(false)})}return()=>{active=false}},[initial]);
 useEffect(()=>{let active=true;if(!client)return;setLoading(true);api.get('/finance/accounts',{params:{client:client._id}}).then(r=>{if(active)setAccounts(r.data.data)}).catch(e=>{if(active)setError(e.response?.data?.message||'Unable to load accounts.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[client?._id,version]);
 const choose=c=>{setAccounts([]);setClient(c)};
 const payableAccounts=accounts.filter(a=>!a.lifecycle||a.lifecycle==='ACTIVE');
 const saved=m=>{setMessage(m);setVersion(v=>v+1)};
 const [holds,setHolds]=useState([]),[adding,setAdding]=useState(false),[registering,setRegistering]=useState(false);
 const canPost=['ADMIN','STAFF'].includes(user?.role),purpose=params.get('purpose')||'AUTO',reservation=purpose==='reservation';
 useEffect(()=>{
  setHolds([]);
  if(!client||!canPost)return;
  let live=true;
  api.get('/finance/reservations',{params:{client:client._id}}).then(r=>{if(live)setHolds(r.data.data.records)}).catch(()=>{});
  return()=>{live=false};
 },[client?._id,version,canPost]);
 const register=async e=>{
  e.preventDefault();if(registering)return;
  setRegistering(true);setError('');
  try{const body=Object.fromEntries(new FormData(e.currentTarget));const {data}=await api.post('/clients',{...body,status:'PROSPECT'});choose(data.data);setAdding(false);}
  catch(err){setError(err.response?.data?.message||'Unable to register prospect.');}
  finally{setRegistering(false);}
 };
 if(reservation&&(params.has('reservationStatus')||params.has('client')||params.has('project'))){
  const redirect=new URLSearchParams(params);redirect.delete('purpose');
  return <Navigate replace to={{pathname:'/reservations',search:redirect.toString()}}/>;
 }
 return <main className="container-fluid p-3 p-md-4 payment-workstation">
  <header className="payment-workstation-header">
   <div className="d-flex align-items-center gap-3"><span className="payment-workstation-icon"><NavIcon name="wallet"/></span><div><h1 className="h3 mb-1">Record Payment</h1><span className="text-secondary"><NavIcon name="calendar"/> {localDate()} · {user?.firstName||user?.username||'Cashier'} {user?.lastName||''}</span></div></div>
   <div className="d-flex gap-2 flex-wrap align-items-center"><span className="badge text-bg-secondary">{message?'Recorded':loading?'Loading':client?'In progress':'Awaiting payer'}</span><Link className="btn btn-outline-secondary btn-sm" to="/payment-transactions"><NavIcon name="receipt"/> Payment History</Link></div>
  </header>
  <FeedbackMessage kind="error" message={error}/><FeedbackMessage kind="success" message={message}/>
  <section className="card mb-3"><div className="card-body">
   <h2 className="h5"><NavIcon name="people"/> Payer</h2>
   <div className="payment-payer-fields">
    <ClientLookup onSelect={c=>{choose(c);setMessage('')}} label="Search clients or prospects"/>
    <label className="form-label">Payment Purpose<select className="form-select" value={purpose} onChange={e=>{setMessage('');setParams(p=>{const next=new URLSearchParams(p);next.set('purpose',e.target.value);return next;});}}>
     <option value="AUTO">Regular / Multi-property Payment</option><option value="DOWN_PAYMENT">Down Payment</option><option value="INSTALLMENT">Monthly Installment</option><option value="PENALTY">Penalty Payment</option>{canPost&&<option value="reservation">Reservation Fee</option>}
    </select></label>
   </div>
   <div className="d-flex flex-wrap gap-2">
    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>setSearch(true)}>Advanced Search</button>
    {canPost&&<button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>setAdding(v=>!v)}>{adding?'Close Registration':'Add Prospect'}</button>}
    {client&&<button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>{choose(null);setMessage('');setError('');setParams({})}}>Clear Payer</button>}
   </div>
   {adding&&<form className="d-flex gap-2 flex-wrap align-items-end mt-3" onSubmit={register}>
    <label>First name *<input required name="firstName" className="form-control"/></label><label>Last name *<input required name="lastName" className="form-control"/></label><label>Contact number<input name="contactNumber" className="form-control"/></label><button className="btn btn-primary" disabled={registering}>{registering?'Saving…':'Save Prospect'}</button>
   </form>}
   {client&&<div className="mt-3">
    <strong>{clientName(client)}</strong> · {client.clientId} {client.status&&<StatusBadge status={client.status}/>}
    <Link className="d-inline-block ms-2" to={`/clients/${client._id}/accounts`}>Open profile</Link>
    {accounts.length>0&&<p className="mb-1 mt-2"><NavIcon name="building"/> {accounts.map(a=>`${a.project?.projectName||''} ${lotName(a.property)}`).join(' · ')}</p>}
    {holds.length>0&&<Link className="small" to={`/reservations?client=${client._id}`}>{holds.length} linked reservation(s)</Link>}
   </div>}
  </div></section>
  {search&&<ClientSearchModal onClose={()=>setSearch(false)} onSelect={c=>{choose(c);setSearch(false);setMessage('')}}/>}
  {loading&&<p role="status">Loading property accounts…</p>}
  {reservation&&canPost&&<ReservationPayment key={client?._id||'new'} admin={user?.role==='ADMIN'} buyer={client} onSaved={saved}/>}
  {!reservation&&client&&payableAccounts.length>0&&canPost&&<PropertyPaymentCheckout key={client._id+purpose} purpose={purpose} client={client} accounts={payableAccounts} initialAccount={payableAccounts.some(a=>a._id===initial)?initial:''} onSaved={saved}/>}
  {!reservation&&client&&!loading&&!payableAccounts.length&&<p className="alert alert-info">This payer has no active contract available for contract payments.</p>}
  {!reservation&&accounts.map(a=><details className="card p-3 my-3" key={a._id} open={initial===a._id}><summary><NavIcon name="building"/> {a.project?.projectName} · {lotName(a.property)} · {a.lifecycle||'ACTIVE'} · Account Details & History</summary><PaymentPenaltyBasis key={`${a._id}-${a.__v}`} account={a} onSaved={saved}/><PropertyPaymentDetails account={a}/><AccountMonitoringDetails account={a} onSaved={saved}/><PropertyPaymentHistory account={a} onSaved={saved}/></details>)}
  {!reservation&&<><button className="btn btn-outline-secondary my-3" onClick={()=>setMonitoring(v=>!v)}>{monitoring?'Hide Penalty Monitoring':'Open Penalty Monitoring'}</button>{monitoring&&<PenaltyMonitoring clientId={client?._id||''} refreshKey={version}/>}</>}
 </main>;
}
