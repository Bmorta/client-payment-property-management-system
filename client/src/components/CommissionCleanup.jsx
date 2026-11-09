import {useEffect,useState} from 'react';
import ClientLookup from './ClientLookup.jsx';
import UnusedCommissionEntries from './UnusedCommissionEntries.jsx';
import CloseButton from './CloseButton.jsx';
import FeedbackMessage from './FeedbackMessage.jsx';
import FieldLabel from './FieldLabel.jsx';
import api from '../services/api.js';
import {lotName} from '../utils/finance.js';
export default function CommissionCleanup({onClose,onSaved}){
 const [client,setClient]=useState(null),[accounts,setAccounts]=useState([]),[id,setId]=useState(''),[details,setDetails]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[version,setVersion]=useState(0);
 useEffect(()=>{let active=true;setAccounts([]);setId('');setDetails(null);setError('');if(client)api.get('/finance/accounts',{params:{client:client._id}}).then(r=>{if(active)setAccounts(r.data.data.filter(a=>a.commissionAgreement))}).catch(e=>{if(active)setError(e.response?.data?.message||'Unable to load assignments.')});return()=>{active=false}},[client?._id]);
 useEffect(()=>{let active=true;setDetails(null);if(!id)return;setLoading(true);api.get(`/commissions/accounts/${id}`).then(r=>{if(active){setDetails(r.data.data);setError('')}}).catch(e=>{if(active)setError(e.response?.data?.message||'Unable to load commission records.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[id,version]);
 return <section className="card my-3" aria-label="Commission cleanup"><div className="card-body"><h3 className="h5">Clean Up Unused Commission Entries</h3><p>Select a client and property to review unused rows. Valid future commissions remain part of the agreement. Correct miscalculated earnings through Reconcile Existing Commissions; payment and payout history cannot be deleted.</p><ClientLookup label="Find client for commission cleanup" onSelect={setClient}/><FieldLabel className="form-label w-100 mt-3">Property commission agreement<select className="form-select" disabled={!client} value={id} onChange={e=>setId(e.target.value)}><option value="">Choose property</option>{accounts.map(a=><option key={a._id} value={a._id}>{a.assignmentId} · {a.project?.projectName} · {lotName(a.property)}</option>)}</select></FieldLabel>{client&&!accounts.length&&<p role="status">No commission agreements loaded for this client.</p>}<FeedbackMessage kind="error" message={error}/>{loading&&<p role="status">Loading commission entries…</p>}{details&&<UnusedCommissionEntries key={`${id}:${version}`} account={details} initiallyOpen onSaved={message=>{setVersion(v=>v+1);onSaved(message)}}/>}<CloseButton label="Close Cleanup" onClick={onClose}/></div></section>;
}
