import {useState} from 'react';
import api from '../services/api.js';
import {useAuth} from '../context/AuthContext.jsx';
import CenterPopup from './CenterPopup.jsx';

export default function CancelledPropertyRelease({account,onSaved=()=>{}}){
 const {user}=useAuth(),[reason,setReason]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 if(user?.role!=='ADMIN')return <p className="alert alert-warning">Administrator approval is required to release a cancelled lot.</p>;
 const save=async()=>{if(busy)return;setBusy(true);try{const r=await api.post(`/finance/accounts/${account._id}/cancelled-property-release`,{reason,requestId:crypto.randomUUID(),confirm:true});setConfirm(false);setReason('');onSaved(r.data.message)}catch(e){setConfirm(false);setError(e.response?.data?.message||'Unable to release the lot. Refresh its status and try again.')}finally{setBusy(false)}};
 return <section className="card card-body my-3"><h3 className="h6">Cancelled Lot — Property Release Review</h3><p>The contract is closed. This approval changes only the lot status to Available; its payments, receipts, commissions and contract history remain preserved.</p><label className="form-label">Release reason<textarea className="form-control" minLength="5" maxLength="1000" required value={reason} onChange={e=>setReason(e.target.value)}/></label><button className="btn btn-warning align-self-start" disabled={busy||reason.trim().length<5} onClick={()=>setConfirm(true)}>Review Property Release</button><CenterPopup error={error} confirm={confirm?`Release ${account.property?.propertyId||'this lot'} to Available? The finalized cancelled contract and all financial history will remain unchanged.`:''} confirmTitle="Approve cancelled lot release" confirmLabel={busy?'Saving…':'Approve Release'} onConfirm={save} onClose={()=>{if(!busy){setConfirm(false);setError('')}}}/></section>;
}
