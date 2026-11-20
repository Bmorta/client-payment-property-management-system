import CashierPaymentStatus from '../components/CashierPaymentStatus.jsx';
import {ReservationPayment,PrecontractPayment} from '../components/Reservations.jsx';
import NavIcon from '../components/NavIcon.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import {localDate} from '../utils/finance.js';
import './payment-workstation.css';
import FeedbackMessage from "../components/FeedbackMessage.jsx";
import PaymentPenaltyBasis from "../components/PaymentPenaltyBasis.jsx";
import {useEffect,useRef,useState} from 'react';
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
export default function PaymentPage(){
 const {user}=useAuth(),[params,setParams]=useSearchParams(),initial=params.get('account')||'';
 const [client,setClient]=useState(null),[records,setRecords]=useState(null),[search,setSearch]=useState(false);
 const [accountLoading,setAccountLoading]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [version,setVersion]=useState(0),[monitoring,setMonitoring]=useState(false),[buyerSession,setBuyerSession]=useState(0);
 const [adding,setAdding]=useState(false),[registering,setRegistering]=useState(false);
 const generation=useRef(0),registrationLock=useRef(false);
 const canPost=['ADMIN','STAFF'].includes(user?.role),purpose=params.get('purpose')||'AUTO',reservation=purpose==='reservation',precontract=purpose==='precontract',initialDown=purpose==='initial-down';
 const buyerId=String(client?._id||'');
 const scopedRecords=records?.buyerId===buyerId&&records?.session===buyerSession?records:null;
 const accounts=scopedRecords?.accounts||[],holds=scopedRecords?.holds||[];
 const loading=accountLoading||!!buyerId&&scopedRecords?.accounts===undefined;
 const payableAccounts=client?.status==='ACTIVE'?accounts.filter(a=>!a.lifecycle||a.lifecycle==='ACTIVE'):[];
 function choose(buyer,{keepAccount=false,addProspect=false}={}){
  const session=++generation.current;
  setBuyerSession(session);setRecords(null);setClient(buyer);
  setError('');setMessage('');setSearch(false);setMonitoring(false);setAdding(addProspect);setAccountLoading(false);
  if(!keepAccount&&initial)setParams(p=>{const next=new URLSearchParams(p);next.delete('account');return next;},{replace:true});
 }
 useEffect(()=>{
  if(!initial)return;
  const session=generation.current;
  let live=true;
  setAccountLoading(true);
  api.get(`/finance/accounts/${initial}`).then(r=>{
   if(live&&generation.current===session)choose(r.data.data.client,{keepAccount:true});
  }).catch(e=>{
   if(live&&generation.current===session)setError(e.response?.data?.message||'Unable to load account.');
  }).finally(()=>{if(live&&generation.current===session)setAccountLoading(false)});
  return()=>{live=false};
 },[initial]);
 useEffect(()=>{
  if(!buyerId)return;
  const session=buyerSession;
  let live=true;
  const apply=update=>{
   if(live&&generation.current===session)setRecords(previous=>({
    ...(previous?.buyerId===buyerId&&previous.session===session?previous:{}),buyerId,session,...update
   }));
  };
  const belongsToBuyer=record=>String(record.client?._id||record.client||'')===buyerId;
  api.get('/finance/accounts',{params:{client:buyerId,...(canPost?{cashier:1}:{})}}).then(r=>apply({accounts:r.data.data.filter(belongsToBuyer)})).catch(e=>{
   apply({accounts:[]});
   if(live&&generation.current===session)setError(e.response?.data?.message||'Unable to load accounts.');
  });
  if(canPost)api.get('/finance/reservations',{params:{client:buyerId}}).then(r=>apply({holds:r.data.data.records.filter(belongsToBuyer)})).catch(()=>{});
  return()=>{live=false};
 },[buyerId,buyerSession,version,canPost]);
 const saved=m=>{if(generation.current!==buyerSession)return;setMessage(m);setVersion(v=>v+1)};
 const register=async e=>{
  e.preventDefault();if(registrationLock.current)return;
  const session=generation.current;
  registrationLock.current=true;setRegistering(true);setError('');
  try{
   const body=Object.fromEntries(new FormData(e.currentTarget));
   const {data}=await api.post('/clients',{...body,status:'PROSPECT'});
   if(generation.current===session)choose(data.data);
  }catch(err){if(generation.current===session)setError(err.response?.data?.message||'Unable to register prospect.');}
  finally{registrationLock.current=false;setRegistering(false);}
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
    <ClientLookup cashier={canPost} key={buyerSession} onSelect={choose} label="Search clients or prospects"/>
    <label className="form-label">Payment Purpose<select className="form-select" value={purpose} onChange={e=>{setMessage('');setParams(p=>{const next=new URLSearchParams(p);next.set('purpose',e.target.value);return next;});}}>
     <option value="AUTO">Regular / Multi-property Payment</option><option value="DOWN_PAYMENT">Down Payment</option><option value="INSTALLMENT">Monthly Installment</option><option value="PENALTY">Penalty Payment</option>{canPost&&<><option value="reservation">Reservation Fee</option><option value="precontract">Pre-contract Down Payment (existing reservation)</option><option value="initial-down">Initial Down Payment (new property hold)</option></>}
    </select></label>
   </div>
   <div className="d-flex flex-wrap gap-2">
    <button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>setSearch(true)}>Advanced Search</button>
    {canPost&&<button type="button" className="btn btn-outline-primary btn-sm" onClick={()=>choose(null,{addProspect:!adding})}>{adding?'Close Registration':'Add Prospect'}</button>}
    {client&&<button type="button" className="btn btn-outline-secondary btn-sm" onClick={()=>choose(null)}>Another Buyer</button>}
   </div>
   {adding&&<form className="d-flex gap-2 flex-wrap align-items-end mt-3" onSubmit={register}>
    <label>First name *<input required name="firstName" className="form-control"/></label><label>Last name *<input required name="lastName" className="form-control"/></label><label>Contact number<input name="contactNumber" className="form-control"/></label><button className="btn btn-primary" disabled={registering}>{registering?'Saving…':'Save Prospect'}</button>
   </form>}
   {client&&<div className="mt-3">
    <strong>{clientName(client)}</strong> · {client.clientId} {client.status&&<StatusBadge status={client.status}/>}
    <Link className="d-inline-block ms-2" to={`/clients/${client._id}/accounts`}>Open profile</Link>
    {accounts.length>0&&<ul className="cashier-property-summary list-unstyled mt-2 mb-1">
      {accounts.map(a=><li key={a._id}><span><NavIcon name="building"/> {a.project?.projectName} · {lotName(a.property)}</span><CashierPaymentStatus payment={a.paymentStatus}/></li>)}
    </ul>}
    {holds.length>0&&<Link className="small" to={`/reservations?client=${client._id}`}>{holds.length} linked reservation(s)</Link>}
   </div>}
  </div></section>
  {search&&<ClientSearchModal cashier={canPost} onClose={()=>setSearch(false)} onSelect={choose}/>}
  {loading&&<p role="status">Loading property accounts…</p>}
  {initialDown&&canPost&&<ReservationPayment key={buyerSession+purpose} initialPurpose="DOWN_PAYMENT" admin={user?.role==='ADMIN'} buyer={client} onSaved={saved}/>}
  {precontract&&canPost&&<PrecontractPayment key={buyerSession} buyer={client} holds={holds} onSaved={saved}/>}
  {reservation&&canPost&&<ReservationPayment key={buyerSession} admin={user?.role==='ADMIN'} buyer={client} onSaved={saved}/>}
  {!reservation&&!precontract&&!initialDown&&client&&payableAccounts.length>0&&canPost&&<PropertyPaymentCheckout key={buyerSession+purpose} purpose={purpose} client={client} accounts={payableAccounts} initialAccount={payableAccounts.some(a=>a._id===initial)?initial:''} onSaved={saved}/>}
  {!reservation&&client&&!loading&&!payableAccounts.length&&<p className="alert alert-info">This payer has no active contract available for contract payments.</p>}
  {!reservation&&accounts.map(a=><details className="card p-3 my-3" key={a._id} open={initial===a._id}><summary><NavIcon name="building"/> {a.project?.projectName} · {lotName(a.property)} · {a.lifecycle||'ACTIVE'} · Account Details & History</summary><PaymentPenaltyBasis key={`${a._id}-${a.__v}`} account={a} onSaved={saved}/><PropertyPaymentDetails account={a}/><AccountMonitoringDetails account={a} onSaved={saved}/><PropertyPaymentHistory account={a} onSaved={saved}/></details>)}
  {!reservation&&<><button className="btn btn-outline-secondary my-3" onClick={()=>setMonitoring(v=>!v)}>{monitoring?'Hide Penalty Monitoring':'Open Penalty Monitoring'}</button>{monitoring&&<PenaltyMonitoring key={buyerSession} clientId={buyerId} refreshKey={version}/>}</>}
 </main>;
}
