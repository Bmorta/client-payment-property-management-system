import StatusBadge from './StatusBadge.jsx';
import {reservationExpiry} from '../../../shared/reservationDates.js';
import AgentPicker from './AgentPicker.jsx';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useSearchParams} from 'react-router-dom';
import {PAYMENT_METHODS,paymentMethodLabel} from '../../../shared/paymentMethods.js';
import api from '../services/api.js';
import PaymentBatchAcknowledgment from './PaymentBatchAcknowledgment.jsx';
import FundingAccountField from './FundingAccountField.jsx';
import FeedbackMessage from './FeedbackMessage.jsx';
import {clientName,lotName,submissionId} from '../utils/finance.js';

const pesos=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
const creditTerms={ANY_PRINCIPAL:'Any eligible principal payment',DOWN_PAYMENT:'Down payment only',FIRST_INSTALLMENT:'First installment only'};
const creditField=(value,onChange)=><label className="form-label">Credit terms *<select required className="form-select" value={value||''} onChange={e=>onChange(e.target.value)}>
  <option value="">Choose the agreed terms</option>{Object.entries(creditTerms).map(([key,label])=><option key={key} value={key}>{label}</option>)}
</select></label>;
export function ReservationPayment({admin,buyer,onSaved}){
  const [data,setData]=useState(null),[lots,setLots]=useState([]),[agent,setAgent]=useState(null);
  const [form,setForm]=useState({method:'CASH'}),[review,setReview]=useState(false),[ack,setAck]=useState(null),[print,setPrint]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [requestId,setRequestId]=useState(submissionId),lock=useRef(false);
  const load=async()=>{
    const [holds,available]=await Promise.all([api.get('/finance/reservations',{params:{client:buyer._id}}),api.get('/finance/reservation-lots')]);
    setData(holds.data.data);setLots(available.data.data);
  };
  useEffect(()=>{if(buyer)load().catch(e=>setError(e.response?.data?.message||'Unable to load available lots.'))},[buyer?._id]);
  const run=async work=>{setBusy(true);setError('');try{await work()}catch(e){setError(e.response?.data?.message||'Unable to record reservation fee.')}finally{setBusy(false)}};
  const prepare=e=>{
    e.preventDefault();
    setError('');
    if(!expiryDate||expiryDate<data.day){setError('Choose a valid holding period with an expiry on or after today.');return;}
    setReview(true);
  };
  const setField=(setter,key,value)=>{setter(previous=>({...previous,[key]:value}));setReview(false)};
  const field=(obj,setter,key,label,props={})=><label className="form-label">{label}
    <input className="form-control" value={obj[key]??''} onChange={e=>{setField(setter,key,e.target.value);setReview(false)}} {...props}/>
  </label>;
  const method=(obj,setter)=><><label className="form-label">Payment method<select className="form-select" value={obj.method||'CASH'} onChange={e=>{setField(setter,'method',e.target.value);setReview(false)}}>
    {PAYMENT_METHODS.map(value=><option key={value} value={value}>{paymentMethodLabel(value)}</option>)}
  </select></label><FundingAccountField method={obj.method} value={obj.fundingAccount} onChange={value=>{setField(setter,'fundingAccount',value);setReview(false)}}/></>;
  const submit=e=>{
    e.preventDefault();
    if(lock.current||!review||!data||!expiryDate||expiryDate<data.day)return;lock.current=true;
    run(async()=>{
      if(!buyer){setError('Choose a buyer or register the prospect.');return}
      const {data:response}=await api.post('/finance/reservations',{...form,clientId:buyer._id,agentId:agent?._id,requestId,paymentDate,startDate,holdDays,expiresOn:expiryDate});
      setForm({method:'CASH'});setAgent(null);setRequestId(submissionId());
      setAck({reservationId:response.data._id});
      setReview(false);onSaved?.('Reservation fee posted and the lot is on hold.');
      await load();
    }).finally(()=>{lock.current=false});
  };
  if(!buyer)return null;
  const paymentDate=form.paymentDate??data?.day??'';
  const startDate=form.startDate??paymentDate;
  const period=form.period||'default';
  const holdDays=period==='default'?data?.defaultDays:Number(period==='custom'?form.customDays:period);
  const expiryDate=reservationExpiry(startDate,holdDays);
  const lot=lots.find(item=>item._id===form.propertyId);
  const override=holdDays!==data?.defaultDays;
  const presets=[7,15,30].filter(days=>days!==data?.defaultDays);
  return <><FeedbackMessage kind="error" message={error}/>
    {ack&&<button className="btn btn-outline-primary mb-2" onClick={()=>setPrint(true)}>Receipt Preview / Print</button>}
    {print&&<PaymentBatchAcknowledgment payment={ack} onClose={()=>setPrint(false)}/>}
    <form className="card p-3 p-md-4 reservation-payment" onSubmit={review?submit:prepare}>
      <h2 className="h5 mb-0">Record reservation fee</h2>
      <fieldset disabled={busy||!data} className="reservation-payment-sections">
        <section>
          <h3 className="h6">Property</h3>
          <div className="reservation-payment-grid">
            <label className="form-label reservation-full">Available lot *<select className="form-select" required value={form.propertyId||''} onChange={e=>setField(setForm,'propertyId',e.target.value)}>
              <option value="">Choose a lot</option>{lots.map(item=><option key={item._id} value={item._id}>{item.project?.projectName} · {lotName(item)}</option>)}
            </select></label>
          </div>
        </section>
        <section>
          <h3 className="h6">Reservation details</h3>
          <div className="reservation-payment-grid">
            {field(form,setForm,'amount','Reservation fee (₱) *',{type:'number',step:'.01',min:'.01',required:true})}
            {field(form,setForm,'startDate','Reservation start date *',{type:'date',required:true,max:data?.day,value:startDate})}
            <label className="form-label">Holding period *<select className="form-select" value={period} onChange={e=>setField(setForm,'period',e.target.value)} required>
              <option value="default">{data?.defaultDays??'—'} days (office default)</option>
              {admin&&presets.map(days=><option key={days} value={days}>{days} days</option>)}
              {admin&&<option value="custom">Custom period</option>}
            </select></label>
            <label className="form-label">Expiry date<input className="form-control" type="date" readOnly value={expiryDate} aria-describedby="reservation-expiry-policy"/></label>
            <small className="text-secondary reservation-full" id="reservation-expiry-policy">The lot is held through the end of the expiry date, Philippine time. Administrators can override the office holding period.</small>
            {period==='custom'&&field(form,setForm,'customDays','Custom holding days *',{type:'number',step:1,min:1,max:365,required:true})}
            {admin&&override&&field(form,setForm,'reason','Override reason *',{required:true})}
            {creditField(form.creditPolicy,value=>setField(setForm,'creditPolicy',value))}
            <label className="form-label reservation-full">Reservation terms *<textarea className="form-control" required value={form.terms||''} onChange={e=>setField(setForm,'terms',e.target.value)}/></label>
          </div>
          {admin&&<details className="mt-3"><summary>Assign an agent (optional)</summary><AgentPicker value={agent} onChange={value=>{setAgent(value);setReview(false)}} activeOnly/></details>}
        </section>
        <section>
          <h3 className="h6">Payment details</h3>
          <div className="reservation-payment-grid">
            {field(form,setForm,'paymentDate','Payment date *',{type:'date',required:true,max:data?.day,value:paymentDate})}
            {method(form,setForm)}
            {field(form,setForm,'receiptNumber','Receipt number *',{required:true})}
            {form.method!=='CASH'&&field(form,setForm,'reference','Payment reference',{maxLength:120})}
            <label className="form-label reservation-full">Remarks<textarea className="form-control" value={form.notes||''} onChange={e=>setField(setForm,'notes',e.target.value)}/></label>
          </div>
        </section>
        <label className="form-check"><input className="form-check-input" type="checkbox" required checked={!!form.confirmed} onChange={e=>setField(setForm,'confirmed',e.target.checked)}/> I reviewed the reservation terms and confirm receipt of payment.</label>
        {review&&<section className="cashier-total border rounded p-3" aria-label="Reservation payment summary">
          <h3 className="h6">Review Reservation Fee</h3>
          <dl className="cashier-facts mb-0">
            <dt>Buyer</dt><dd>{clientName(buyer)}</dd>
            <dt>Property</dt><dd>{lot?.project?.projectName} · {lotName(lot)}</dd>
            <dt>Holding period</dt><dd>{holdDays} days</dd>
            <dt>Expiry date</dt><dd>{expiryDate}</dd>
            <dt>Payment method</dt><dd>{paymentMethodLabel(form.method)}</dd>
            <dt>Total received</dt><dd>{pesos(Math.round(Number(form.amount)*100))}</dd>
          </dl>
        </section>}
        <div className="d-flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy||!expiryDate}>{busy?'Recording…':review?'Confirm & Record Payment':'Preview Payment'}</button>
          <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={()=>{setReview(false);setForm({method:'CASH'});setAgent(null);setRequestId(submissionId());setError('')}}>Clear</button>
        </div>
      </fieldset>
    </form>
  </>;
}

export default function Reservations({admin,clientId='',propertyId='',onChanged}) {
  const [params]=useSearchParams(),clientFilter=clientId||params.get('client')||'',propertyFilter=propertyId||params.get('property')||'',statusFilter=params.get('reservationStatus')||'',projectFilter=params.get('project')||'';
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true),[receipt,setReceipt]=useState(null);
  const [query,setQuery]=useState(''),[startDate,setStartDate]=useState(''),[expiryDate,setExpiryDate]=useState('');
  const [defaultDays,setDefaultDays]=useState('');
  const [details,setDetails]=useState(null),[action,setAction]=useState('');
  const [changes,setChanges]=useState({}),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const load=useCallback(async()=>{
    const response=await api.get('/finance/reservations',{params:{client:clientFilter,project:projectFilter,property:propertyFilter}});
    setData(response.data.data);setLoading(false);
  },[clientFilter,projectFilter,propertyFilter]);
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
      setDetails(null);setMessage('Reservation updated.');onChanged?.();await load();
    });
  };
  const records=(data?.records||[]).filter(row=>{
    const searchable=[row._id,row.client?.clientId,clientName(row.client),row.project?.projectName,lotName(row.property)].join(' ').toLowerCase();
    if(!searchable.includes(query.trim().toLowerCase())||startDate&&row.startDate!==startDate||expiryDate&&row.expiresOn!==expiryDate)return false;
    if(statusFilter==='closed')return ['CANCELLED','RELEASED'].includes(row.status);
    if(statusFilter==='today')return row.status==='ACTIVE'&&row.remainingDays===0;
    if(statusFilter==='week')return row.status==='ACTIVE'&&row.remainingDays>=0&&row.remainingDays<=7;
    if(statusFilter==='creditCents')return row.disposition==='OUTSTANDING';
    return !['active','expired','converted'].includes(statusFilter)||row.status===statusFilter.toUpperCase();
  });
  return <section className="d-grid gap-3">
    <FeedbackMessage kind="error" message={error}/><FeedbackMessage kind="success" message={message}/>
        {!clientId&&!propertyId&&<nav aria-label="Reservation filters" className="d-flex gap-2 flex-wrap">{[['active','Active'],['week','Expiring Soon'],['expired','Expired / Awaiting Action'],['converted','Converted to Sale'],['closed','Cancelled / Released'],['','History']].map(([key,label])=><Link key={key} className={'btn btn-sm '+(statusFilter===key?'btn-primary':'btn-outline-primary')} to={{pathname:'/reservations',search:new URLSearchParams([...params].filter(([k])=>k!=='reservationStatus').concat(key?[['reservationStatus',key]]:[])).toString()}}>{label}</Link>)}</nav>}
    {admin&&data&&!clientId&&!propertyId&&<details className="card p-3"><summary>Reservation settings</summary>
      <form className="d-flex flex-wrap align-items-end gap-2 mt-2" onSubmit={e=>{e.preventDefault();run(async()=>{
        await api.patch('/finance/reservations/settings',{holdDays:Number(defaultDays||data.defaultDays)});
        setDefaultDays('');setMessage('Default hold period saved for new reservations.');await load();
      })}}>
        <label className="form-label mb-0">Default holding period in days<input type="number" min={1} max={365} required className="form-control" value={defaultDays||data.defaultDays} onChange={e=>setDefaultDays(e.target.value)}/></label>
        <button className="btn btn-outline-primary" disabled={busy}>Save default</button>
      </form>
    </details>}
    <section className="card p-3">
      <div className="d-flex justify-content-between"><h2 className="h5">Reservation records</h2></div>
      <div className="d-flex flex-wrap gap-2 mb-2">
        <label className="form-label">Find reservation<input className="form-control" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buyer, project, phase, block or lot"/></label>
        <label className="form-label">Reservation date<input className="form-control" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label className="form-label">Expiry date<input className="form-control" type="date" value={expiryDate} onChange={e=>setExpiryDate(e.target.value)}/></label>
      </div><div className="table-responsive"><table className="table align-middle"><thead><tr><th>Buyer / Lot</th><th>Fee / Credit</th><th>Hold period</th><th>Status</th><th/></tr></thead>
        <tbody>{records.map(row=><tr key={row._id}>
          <td><small className="d-block text-secondary">{row._id}</small>{clientName(row.client)} · {row.project?.projectName} · {lotName(row.property)}</td>
          <td>{pesos(row.amountCents)}<br/><small>Credit {pesos(row.disposition==='OUTSTANDING'?row.amountCents:0)}</small></td><td>{row.startDate} → {row.expiresOn}<br/><small>{Math.round((Date.parse(row.expiresOn)-Date.parse(row.startDate))/86400000)} days{row.agent?.fullName&&' · '+row.agent.fullName}</small></td>
          <td><StatusBadge status={row.status==='ACTIVE'&&row.remainingDays<=7?'EXPIRING_SOON':row.status}/>{row.status==='ACTIVE'?` · ${row.remainingDays===0?'Expires today':row.remainingDays===1?'Expires tomorrow':row.remainingDays+' days remaining'}`:row.status==='EXPIRED'?` · ${-row.remainingDays} day(s) overdue`:''}</td>
          <td><button className="btn btn-outline-primary btn-sm" onClick={()=>setReview(row)}>View</button></td>
        </tr>)}</tbody>
      </table></div>
      {loading&&!error?<p role="status">Loading reservations…</p>:!records.length&&<p>No reservations match this view.</p>}
    </section>
    {receipt&&<PaymentBatchAcknowledgment payment={{reservationId:receipt}} onClose={()=>setReceipt(null)}/>}
    {details&&<section className="card p-3">
      <div className="d-flex justify-content-between"><h2 className="h5">{clientName(details.client)} · {lotName(details.property)}</h2><button className="btn btn-outline-secondary btn-sm" onClick={()=>setDetails(null)}>Close</button></div>
      <p>Receipt {details.payment.receiptNumber} · {details.startDate} · {pesos(details.amountCents)} · {details.disposition}</p>
      <button type="button" className="btn btn-sm btn-outline-secondary align-self-start my-2" onClick={()=>setReceipt(details._id)}>Receipt Preview / Print</button>
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
