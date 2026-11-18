import AgentPicker from './AgentPicker.jsx';
import {useCallback,useEffect,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {PAYMENT_METHODS,paymentMethodLabel} from '../../../shared/paymentMethods.js';
import api from '../services/api.js';
import ClientLookup from './ClientLookup.jsx';
import FundingAccountField from './FundingAccountField.jsx';
import FeedbackMessage from './FeedbackMessage.jsx';
import {clientName,lotName} from '../utils/finance.js';

const pesos=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
const creditTerms={ANY_PRINCIPAL:'Any eligible principal payment',DOWN_PAYMENT:'Down payment only',FIRST_INSTALLMENT:'First installment only'};
const creditField=(value,onChange)=><label className="form-label">Credit terms<select required className="form-select" value={value||''} onChange={e=>onChange(e.target.value)}>
  <option value="">Choose the agreed terms</option>{Object.entries(creditTerms).map(([key,label])=><option key={key} value={key}>{label}</option>)}
</select></label>;
const labels={active:'Active',today:'Expiring Today',week:'Expiring Within 7 Days',expired:'Expired',converted:'Converted',feesCents:'Fees Collected',creditCents:'Outstanding Credits'};
export function ReservationMetrics({metrics,project=''}) {
  if(!metrics)return null;
  return <div className="d-flex flex-wrap gap-2 my-3">{Object.entries(labels).map(([key,label])=>
    <Link key={key} className="btn btn-outline-primary btn-sm" to={`/payment?purpose=reservation&reservationStatus=${key}${project?'&project='+project:''}`}>{label} · {key.endsWith('Cents')?pesos(metrics[key]):metrics[key]}</Link>
  )}</div>;
}
export default function Reservations({admin}) {
  const [params]=useSearchParams(),clientFilter=params.get('client')||'',statusFilter=params.get('reservationStatus')||'',projectFilter=params.get('project')||'';
  const [data,setData]=useState(null),[lots,setLots]=useState([]),[buyer,setBuyer]=useState(null);
  const [agent,setAgent]=useState(null);
  const [defaultDays,setDefaultDays]=useState('');
  const [form,setForm]=useState({method:'CASH'}),[details,setDetails]=useState(null),[action,setAction]=useState('');
  const [changes,setChanges]=useState({}),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [requestId,setRequestId]=useState(()=>globalThis.crypto?.randomUUID?.()||`reservation-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const load=useCallback(async()=>{
    const [holds,available]=await Promise.all([api.get('/finance/reservations',{params:{client:clientFilter,project:projectFilter}}),api.get('/finance/reservation-lots')]);
    setData(holds.data.data);
    setLots(available.data.data);
  },[clientFilter,projectFilter]);
  useEffect(()=>{
    const refresh=()=>load().catch(e=>setError(e.response?.data?.message||'Unable to load reservations.'));
    refresh();
    const interval=setInterval(refresh,60000);
    return ()=>clearInterval(interval);
  },[load]);
  const run=async work=>{
    setBusy(true);setError('');setMessage('');
    try {await work();} catch(e){setError(e.response?.data?.message||'The reservation action could not be completed.')}
    finally{setBusy(false)}
  };
  const setField=(setter,key,value)=>setter(previous=>({...previous,[key]:value}));
  const field=(obj,setter,key,label,props={})=><label className="form-label">{label}
    <input className="form-control" value={obj[key]??''} onChange={e=>{setField(setter,key,e.target.value);if(setter===setChanges)setPreview(null)}} {...props}/>
  </label>;
  const method=(obj,setter)=><><label className="form-label">Payment method<select className="form-select" value={obj.method||'CASH'} onChange={e=>{setField(setter,'method',e.target.value);setPreview(null)}}>
    {PAYMENT_METHODS.map(value=><option key={value} value={value}>{paymentMethodLabel(value)}</option>)}
  </select></label><FundingAccountField method={obj.method} value={obj.fundingAccount} onChange={value=>{setField(setter,'fundingAccount',value);setPreview(null)}}/></>;
  const submit=e=>{
    e.preventDefault();
    run(async()=>{
      if(!buyer){setError('Choose a buyer or register the prospect.');return}
      await api.post('/finance/reservations',{...form,clientId:buyer._id,agentId:agent?._id,requestId,paymentDate:form.paymentDate||data.day});
      setForm({method:'CASH'});setBuyer(null);setAgent(null);setRequestId(globalThis.crypto?.randomUUID?.()||`reservation-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      setMessage('Reservation fee posted and the lot is on hold.');
      await load();
    });
  };
  const setReview=row=>{
    setDetails(row);setAction('');setChanges({method:'CASH',terms:row.terms,creditPolicy:row.creditPolicy,notes:row.notes});setPreview(null);
  };
  const manage=e=>{
    e.preventDefault();
    run(async()=>{
      const base=`/finance/reservations/${details._id}`;
      if(action==='CONVERT'&&!preview){
        const result=await api.post(base+'/convert/preview',changes);
        setPreview(result.data.data);
        return;
      }
      if(action==='CONVERT')await api.post(base+'/convert',{...changes,token:preview.token,confirmed:true});
      else await api.post(base+'/manage',{...changes,action,version:details.__v,confirmed:true});
      setDetails(null);setMessage('Reservation updated.');await load();
    });
  };
  const records=(data?.records||[]).filter(row=>{
    if(statusFilter==='today')return row.status==='ACTIVE'&&row.remainingDays===0;
    if(statusFilter==='week')return row.status==='ACTIVE'&&row.remainingDays>0&&row.remainingDays<=7;
    if(statusFilter==='creditCents')return row.disposition==='OUTSTANDING';
    return !['active','expired','converted'].includes(statusFilter)||row.status===statusFilter.toUpperCase();
  });
  return <section className="d-grid gap-3">
    <FeedbackMessage kind="error" message={error}/><FeedbackMessage kind="success" message={message}/>
    <ReservationMetrics metrics={data?.metrics}/><Link to="/payment-transactions?purpose=reservation">View reservation fee transactions</Link>
    {admin&&data&&<details className="card p-3"><summary>Reservation settings</summary>
      <form className="d-flex flex-wrap align-items-end gap-2 mt-2" onSubmit={e=>{e.preventDefault();run(async()=>{
        await api.patch('/finance/reservations/settings',{holdDays:Number(defaultDays||data.defaultDays)});
        setDefaultDays('');setMessage('Default hold period saved for new reservations.');await load();
      })}}>
        <label className="form-label mb-0">Default holding period in days<input type="number" min={1} max={365} required className="form-control" value={defaultDays||data.defaultDays} onChange={e=>setDefaultDays(e.target.value)}/></label>
        <button className="btn btn-outline-primary" disabled={busy}>Save default</button>
      </form>
    </details>}
    <form className="card p-3" onSubmit={submit}>
      <h2 className="h5">Record reservation fee</h2>
      <ClientLookup onSelect={setBuyer} label="Find buyer or prospect"/>
      {buyer?<p>Selected buyer · {clientName(buyer)}</p>:<Link to="/clients">Register a new prospect in Client List</Link>}
      <label className="form-label my-2">Available lot<select className="form-select" required value={form.propertyId||''} onChange={e=>setField(setForm,'propertyId',e.target.value)}>
        <option value="">Choose a lot</option>{lots.map(lot=><option key={lot._id} value={lot._id}>{lot.project?.projectName} · {lotName(lot)}</option>)}
      </select></label>
      <div className="d-flex flex-wrap gap-3">
        {field(form,setForm,'amount','Reservation fee',{type:'number',step:'.01',min:'.01',required:true})}
        {field(form,setForm,'paymentDate','Payment date',{type:'date',max:data?.day,value:form.paymentDate??data?.day??''})}
        {field(form,setForm,'receiptNumber','Receipt number',{required:true})}
        {method(form,setForm)}
        {admin&&field(form,setForm,'expiresOn','Override expiry',{type:'date'})}
        {admin&&form.expiresOn&&field(form,setForm,'reason','Override reason',{required:true})}
      </div>
      {admin&&<details className="mb-2"><summary>Assign an agent to the hold (optional)</summary><AgentPicker value={agent} onChange={setAgent} activeOnly/></details>}
      <p>Default hold · {data?.defaultDays??7} days from the payment date</p>
      {creditField(form.creditPolicy,value=>setField(setForm,'creditPolicy',value))}
      <label className="form-label">Reservation terms<textarea className="form-control" required value={form.terms||''} onChange={e=>setField(setForm,'terms',e.target.value)}/></label>
      {field(form,setForm,'notes','Notes')}
      <label className="form-check mb-2"><input className="form-check-input" type="checkbox" required checked={!!form.confirmed} onChange={e=>setField(setForm,'confirmed',e.target.checked)}/> I reviewed the reservation terms and confirm receipt of payment.</label>
      <div><button className="btn btn-primary" disabled={busy||!data}>Post reservation fee</button></div>
    </form>
    <section className="card p-3">
      <div className="d-flex justify-content-between"><h2 className="h5">Reservation records</h2><Link to="/payment?purpose=reservation">All records</Link></div>
      <div className="table-responsive"><table className="table align-middle"><thead><tr><th>Buyer / Lot</th><th>Fee</th><th>Expiry</th><th>Status</th><th/></tr></thead>
        <tbody>{records.map(row=><tr key={row._id}>
          <td>{clientName(row.client)} · {row.project?.projectName} · {lotName(row.property)}</td>
          <td>{pesos(row.amountCents)}</td><td>{row.expiresOn}</td>
          <td>{row.status}{row.status==='ACTIVE'?` · ${row.remainingDays===0?'Expires today':row.remainingDays===1?'Expires tomorrow':row.remainingDays+' days remaining'}`:row.status==='EXPIRED'?` · ${-row.remainingDays} day(s) overdue`:''}</td>
          <td><button className="btn btn-outline-primary btn-sm" onClick={()=>setReview(row)}>View</button></td>
        </tr>)}</tbody>
      </table></div>
      {!records.length&&<p>No reservations match this view.</p>}
    </section>
    {details&&<section className="card p-3">
      <div className="d-flex justify-content-between"><h2 className="h5">{clientName(details.client)} · {lotName(details.property)}</h2><button className="btn btn-outline-secondary btn-sm" onClick={()=>setDetails(null)}>Close</button></div>
      <p>Receipt {details.payment.receiptNumber} · {details.startDate} · {pesos(details.amountCents)} · {details.disposition}</p>
      {details.agent&&<p>Reservation agent · {details.agent.fullName}</p>}
      <p>{creditTerms[details.creditPolicy]}</p>
      <p>{details.terms}</p>{details.notes&&<p>{details.notes}</p>}
      {details.account&&<Link to={`/payment?account=${details.account._id}`}>Open converted account · {details.account.assignmentId}</Link>}
      <details><summary>Activity history</summary><ul>{details.history.map((event,index)=><li key={index}>{event.action} · {event.username||'REMS'} · {new Date(event.timestamp).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} {event.reason&&`· ${event.reason}`}</li>)}</ul></details>
      {admin&&(details.held||details.disposition==='OUTSTANDING')&&<form className="mt-3" onSubmit={manage}>
        <label className="form-label">Action<select className="form-select" value={action} onChange={e=>{setAction(e.target.value);setPreview(null)}}>
          <option value="">Choose action</option>
          {details.held?<><option value="EXTEND">Extend reservation</option><option value="CORRECT">Correct terms or notes</option><option value="CANCEL">Cancel reservation</option>
            {details.status==='EXPIRED'?<option value="RELEASE">Release lot</option>:<option value="CONVERT">Convert to sale</option>}</>:<option value="DISPOSITION">Record fee disposition</option>}
        </select></label>
        {action&&<div className="d-flex flex-wrap align-items-baseline gap-3">
          {action==='EXTEND'&&field(changes,setChanges,'expiresOn','New expiry',{type:'date',required:true})}
          {action==='CORRECT'&&<>{creditField(changes.creditPolicy,value=>setField(setChanges,'creditPolicy',value))}{field(changes,setChanges,'terms','Corrected terms',{required:true})}{field(changes,setChanges,'notes','Corrected notes')}</>}
          {action==='CONVERT'&&<>
            {field(changes,setChanges,'months','Contract term in months',{type:'number',min:1,max:1200,required:true})}
            {field(changes,setChanges,'downPayment','Contract down payment',{type:'number',min:0,step:'.01'})}
            {field(changes,setChanges,'firstDueDate','First monthly due date',{type:'date',min:data?.day,required:true})}
            {field(changes,setChanges,'installment','Credit target (0 for down payment, 1 for first month)',{type:'number',min:0,required:true})}
            {method(changes,setChanges)}{field(changes,setChanges,'receiptNumber','Receipt for additional money')}
          </>}
          {action==='DISPOSITION'&&<>
            <label className="form-label">Fee disposition<select required className="form-select" value={changes.disposition||''} onChange={e=>setField(setChanges,'disposition',e.target.value)}>
              <option value="">Choose disposition</option><option value="REFUNDED">Record actual refund</option><option value="RETAINED">Retain under approved terms</option>
            </select></label>
            {field(changes,setChanges,'reference','Supporting agreement or refund reference',{required:true})}
            {changes.disposition==='REFUNDED'&&<>{field(changes,setChanges,'date','Actual refund date',{type:'date',required:true,max:data?.day})}{method(changes,setChanges)}</>}
          </>}
          {field(changes,setChanges,'reason','Reason',{required:true})}
          {preview&&<p className="w-100">Contract total {pesos(preview.contract.totalCents)} · Payment due {pesos(preview.target.amountCents)} · Reservation credit {pesos(preview.creditCents)} · New collection {pesos(preview.additionalCents)}</p>}
          <button className={['CANCEL','RELEASE'].includes(action)?'btn btn-outline-danger':'btn btn-primary'} disabled={busy}>{action==='CONVERT'?(preview?'Confirm conversion and payment':'Preview conversion'):'Confirm action'}</button>
        </div>}
      </form>}
    </section>}
  </section>;
}
