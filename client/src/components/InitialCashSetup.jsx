import {useState,useRef} from 'react';
import {Link} from 'react-router-dom';
import {useAuth} from '../context/AuthContext.jsx';
import api from '../services/api.js';
import {localDate,submissionId} from '../utils/finance.js';
import CenterPopup from './CenterPopup.jsx';

export function CashSetupNotice({data}){
 const {user}=useAuth();
 if(data.openingBaselineDate)return null;
 return <div className="alert alert-warning" role="status"><strong>Initial cash balance has not been confirmed.</strong><p className="mb-2">Collections can still be recorded, but physical cash is unavailable until an administrator confirms the starting cash count. This is a one-time setup; daily balances carry forward automatically.</p>{user?.role==='ADMIN'?<Link className="btn btn-outline-primary btn-sm" to="/reports?view=cash&focus=movements&cashTab=adjustments">Confirm Initial Cash Balance</Link>:<p className="mb-0">Ask an administrator to confirm the opening cash balance.</p>}</div>;
}

export default function InitialCashSetup({onSaved}){
 const [date,setDate]=useState(localDate),[confirmed,setConfirmed]=useState(false),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 const lock=useRef(false),identity=useRef(submissionId());
 const save=async()=>{if(lock.current||!confirmed||!review)return;lock.current=true;setBusy(true);try{const r=await api.post('/finance/cash-ledger',{kind:'OPENING',amount:0,effectiveDate:date,reason:'Initial physical cash count confirmed as zero',coverageConfirmed:true,confirm:true,requestId:identity.current});setReview(false);setSaved(true);onSaved(r.data.message)}catch(e){setReview(false);setError(e.response?.data?.message||'Unable to confirm the opening balance. Check the ledger before retrying.')}finally{lock.current=false;setBusy(false)}};
 if(saved)return <p className="alert alert-success">Initial zero cash balance confirmed. Daily carry-forward is enabled.</p>;
 return <section className="card card-body mb-3" aria-label="Initial cash setup"><h3 className="h6">Start with ₱0.00 Cash</h3><p className="small">Use this only if physical cash was zero at the beginning of the selected date, before that day's collections or expenses. Earlier cash movements are not added again. If cash was already held, use the opening balance form below instead.</p><form onSubmit={e=>{e.preventDefault();if(confirmed)setReview(true)}}><fieldset disabled={busy}><label className="form-label">First cash ledger date<input className="form-control" type="date" required max={localDate()} value={date} onChange={e=>{setDate(e.target.value);setConfirmed(false);identity.current=submissionId()}}/></label><label className="form-check mb-3"><input type="checkbox" required className="form-check-input" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I confirm the physical cash count was ₱0.00 at the start of this date and subsequent cash records are complete.</label><button className="btn btn-primary" disabled={!confirmed||busy}>Review Zero Opening Balance</button></fieldset></form><CenterPopup error={error} confirm={review?`Confirm the initial physical cash balance of ₱0.00 on ${date}? Only one opening balance is allowed.`:''} confirmTitle="Confirm initial cash balance" confirmLabel={busy?'Saving...':'Confirm ₱0.00'} onConfirm={save} onClose={()=>{if(!busy){setReview(false);setError('')}}}/></section>;
}
