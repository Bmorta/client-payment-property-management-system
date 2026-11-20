import DateRangeFilter from './DateRangeFilter.jsx';
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
import AssignmentFields,{blankAssignment} from './AssignmentFields.jsx';
import {moneyCents} from '../../../shared/paymentSchedule.js';
import {clientName,lotName,submissionId} from '../utils/finance.js';

const pesos=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(n/100);
const creditTerms={ANY_PRINCIPAL:'Any eligible principal payment',DOWN_PAYMENT:'Down payment only',FIRST_INSTALLMENT:'First installment only'};
const creditField=(value,onChange)=><label className="form-label">Credit terms *<select required className="form-select" value={value||''} onChange={e=>onChange(e.target.value)}>
  <option value="">Choose the agreed terms</option>{Object.entries(creditTerms).map(([key,label])=><option key={key} value={key}>{label}</option>)}
</select></label>;
const pendingDeposits=row=>[...(row?.paymentPurpose==='DOWN_PAYMENT'&&row.disposition==='OUTSTANDING'?[row.payment]:[]),...(row?.precontractPayments||[])].filter(p=>!(row.precontractRefunds||[]).some(r=>r.paymentId===p.paymentId)&&!(row.appliedPrecontractPaymentIds||[]).includes(p.paymentId));
export function PrecontractPayment({buyer,holds,onSaved}){
 const [holdId,setHoldId]=useState(''),[form,setForm]=useState({method:'CASH'}),[requestId,setRequestId]=useState(submissionId),[review,setReview]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[ack,setAck]=useState(null),lock=useRef(false);
 const active=holds.filter(h=>h.status==='ACTIVE'&&h.held),hold=active.find(h=>h._id===holdId),update=(key,value)=>{setForm(f=>({...f,[key]:value}));setReview(false)};
 const submit=async e=>{e.preventDefault();if(!hold||lock.current)return;if(!review){setReview(true);return}lock.current=true;setBusy(true);setError('');try{
  const {data}=await api.post(`/finance/reservations/${holdId}/precontract-payment`,{...form,requestId,clientId:buyer._id,propertyId:hold.property._id,confirmed:true});
  setAck({reservationId:holdId,paymentId:data.data.paymentId});setForm({method:'CASH'});setReview(false);setRequestId(submissionId());onSaved?.('Down-payment receipt posted once, awaiting contract allocation.');
 }catch(e){setError(e.response?.data?.message||'Unable to post receipt.')}finally{lock.current=false;setBusy(false)}};
 if(!buyer)return null;
 return <section className="card p-3"><h2 className="h5">Pre-contract down payment</h2><p className="small">Record actual money received against an active reservation. This does not activate a contract. Its original receipt will be allocated when the contract is approved.</p><FeedbackMessage kind="error" message={error}/>
 {!active.length?<p>No active held reservation. Establish the correct property reservation first, or create the sales contract before accepting a regular down payment.</p>:<form onSubmit={submit}><fieldset disabled={busy}><div className="row g-2"><label className="col-md-6">Reserved property *<select required className="form-select" value={holdId} onChange={e=>{setHoldId(e.target.value);setReview(false)}}><option value="">Select reservation</option>{active.map(h=><option key={h._id} value={h._id}>{h.project?.projectName} · {lotName(h.property)}</option>)}</select></label>{[['amount','Amount (₱)','number'],['paymentDate','Actual receipt date','date'],['receiptNumber','Original receipt number','text'],['reference','Reference','text']].map(([k,l,type])=><label key={k} className="col-md-6">{l}<input className="form-control" type={type} min={type==='number'?'.01':type==='date'?hold?.startDate:undefined} step={type==='number'?'.01':undefined} required={k!=='reference'} value={form[k]||''} onChange={e=>update(k,e.target.value)}/></label>)}<label className="col-md-6">Payment method<select className="form-select" value={form.method} onChange={e=>update('method',e.target.value)}>{PAYMENT_METHODS.map(m=><option key={m} value={m}>{paymentMethodLabel(m)}</option>)}</select></label><FundingAccountField method={form.method} value={form.fundingAccount} onChange={v=>update('fundingAccount',v)}/></div>{review&&<p className="alert alert-info mt-3">Confirm receipt of {pesos(Math.round(Number(form.amount)*100))} for {lotName(hold?.property)} on {form.paymentDate}. No contract will be activated.</p>}<button type="submit" className="btn btn-primary mt-3" disabled={!hold||busy}>{review?'Confirm & Record Receipt':'Review Receipt'}</button></fieldset></form>}{ack&&<PaymentBatchAcknowledgment payment={ack} onClose={()=>setAck(null)}/>}</section>;
}
export function ReservationPayment({admin,buyer,onSaved,initialPurpose="RESERVATION_FEE"}){
  const [data,setData]=useState(null),[lots,setLots]=useState([]),[agent,setAgent]=useState(null);
  const initialDown=initialPurpose==='DOWN_PAYMENT';
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
      const {data:response}=await api.post('/finance/reservations',{...form,creditPolicy:initialDown?'DOWN_PAYMENT':form.creditPolicy,paymentPurpose:initialPurpose,clientId:buyer._id,agentId:agent?._id,requestId,paymentDate,startDate,holdDays,expiresOn:expiryDate});
      setForm({method:'CASH'});setAgent(null);setRequestId(submissionId());
      setAck({reservationId:response.data._id});
      setReview(false);onSaved?.(initialDown?'Initial down payment posted and the lot is held pending contract activation.':'Reservation fee posted and the lot is on hold.');
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
      <h2 className="h5 mb-0">{initialDown?'Hold property with initial down payment':'Record reservation fee'}</h2>
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
            {field(form,setForm,'amount',initialDown?'Initial down payment (₱) *':'Reservation fee (₱) *',{type:'number',step:'.01',min:'.01',required:true})}
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
            {initialDown?<p className="small">This receipt will be applied to the approved down payment, not treated as a reservation fee.</p>:creditField(form.creditPolicy,value=>setField(setForm,'creditPolicy',value))}
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
          <h3 className="h6">{initialDown?'Review Initial Down Payment':'Review Reservation Fee'}</h3>
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
  const [query,setQuery]=useState(''),[dateBasis,setDateBasis]=useState('startDate'),[range,setRange]=useState({from:'',to:''});
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
    setDetails(row);setAction('');setChanges({...blankAssignment(),installment:row.creditPolicy==='FIRST_INSTALLMENT'?'1':'0',...row.contractDraft?.values,reason:row.contractDraft?.reason||'',method:'CASH',terms:row.terms,creditPolicy:row.creditPolicy,notes:row.notes,projectId:row.project?._id,propertyId:row.property?._id,phase:String(row.property?.phaseNumber??''),block:String(row.property?.blockNumber??''),expectedAreaSqm:row.property?.areaSqm,expectedPricePerSqm:row.property?.pricePerSqm,additionalAmount:'0',paymentDate:data?.day});setPreview(null);
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
    if(!searchable.includes(query.trim().toLowerCase())||range.from&&row[dateBasis]<range.from||range.to&&row[dateBasis]>range.to)return false;
    if(statusFilter==='closed')return ['CANCELLED','RELEASED'].includes(row.status);
    if(statusFilter==='today')return row.status==='ACTIVE'&&row.remainingDays===0;
    if(statusFilter==='week')return row.status==='ACTIVE'&&row.remainingDays>=0&&row.remainingDays<=7;
    if(statusFilter==='creditCents')return row.disposition==='OUTSTANDING'||row.pendingDownPaymentCents>0;
    return !['active','expired','converted'].includes(statusFilter)||row.status===statusFilter.toUpperCase();
  });
  const priorDownPayment=pendingDeposits(details).reduce((n,p)=>n+p.amountCents,0),reservationAmount=details?.paymentPurpose==='DOWN_PAYMENT'?0:details?.amountCents||0;
  let liveRemainingDownPayment=null;
  try{liveRemainingDownPayment=moneyCents(changes.downPayment||0)-priorDownPayment-(String(changes.installment)==='0'?reservationAmount+moneyCents(changes.additionalAmount||0):0)}catch{}
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
        <label className="form-label">Date Basis<select className="form-select" value={dateBasis} onChange={e=>setDateBasis(e.target.value)}><option value="startDate">Reservation date</option><option value="expiresOn">Expiry date</option></select></label><DateRangeFilter value={range} allRange={{from:"",to:""}} onChange={setRange}/>
      </div><div className="table-responsive"><table className="table align-middle"><thead><tr><th>Buyer / Lot</th><th>Receipt / Credit</th><th>Hold period</th><th>Status</th><th/></tr></thead>
        <tbody>{records.map(row=><tr key={row._id}>
          <td><small className="d-block text-secondary">{row._id}</small>{clientName(row.client)} · {row.project?.projectName} · {lotName(row.property)}</td>
          <td>{pesos(row.amountCents)}<br/><small>{row.paymentPurpose==='DOWN_PAYMENT'?'Initial down payment':'Reservation fee'} · Pending credit {pesos((row.disposition==='OUTSTANDING'&&row.paymentPurpose!=='DOWN_PAYMENT'?row.amountCents:0)+(row.pendingDownPaymentCents||0))}</small></td><td>{row.startDate} → {row.expiresOn}<br/><small>{Math.round((Date.parse(row.expiresOn)-Date.parse(row.startDate))/86400000)} days{row.agent?.fullName&&' · '+row.agent.fullName}</small></td>
          <td><StatusBadge status={row.status==='ACTIVE'&&row.remainingDays<=7?'EXPIRING_SOON':row.status}/>{row.status==='ACTIVE'?` · ${row.remainingDays===0?'Expires today':row.remainingDays===1?'Expires tomorrow':row.remainingDays+' days remaining'}`:row.status==='EXPIRED'?` · ${-row.remainingDays} day(s) overdue`:''}</td>
          <td><button className="btn btn-outline-primary btn-sm" onClick={()=>setReview(row)}>View</button></td>
        </tr>)}</tbody>
      </table></div>
      {loading&&!error?<p role="status">Loading reservations…</p>:!records.length&&<p>No reservations match this view.</p>}
    </section>
    {receipt&&<PaymentBatchAcknowledgment payment={typeof receipt==='string'?{reservationId:receipt}:receipt} onClose={()=>setReceipt(null)}/>}
    {details&&<section className="card p-3">
      <div className="d-flex justify-content-between"><h2 className="h5">{clientName(details.client)} · {lotName(details.property)}</h2><button className="btn btn-outline-secondary btn-sm" onClick={()=>setDetails(null)}>Close</button></div>
      <p>{details.paymentPurpose==='DOWN_PAYMENT'?'Initial down payment':'Reservation fee'} receipt {details.payment.receiptNumber} · {details.startDate} · {pesos(details.amountCents)} · {details.disposition}</p>
      <button type="button" className="btn btn-sm btn-outline-secondary align-self-start my-2" onClick={()=>setReceipt((details.appliedPrecontractPaymentIds||[]).includes(details.payment.paymentId)&&details.account?{accountId:details.account._id,paymentId:details.payment.paymentId}:details._id)}>Receipt Preview / Print</button>
      {details.agent&&<p>Reservation agent · {details.agent.fullName}</p>}
      <p>{creditTerms[details.creditPolicy]}</p>
      <p>{details.terms}</p>{details.notes&&<p>{details.notes}</p>}
      {!!details.precontractPayments?.length&&<section className="border rounded p-3 my-2"><h3 className="h6">Pre-contract down-payment receipts</h3>{details.precontractPayments.map(p=><p key={p.paymentId} className="small">{p.receiptNumber} · {p.paymentDate} · {paymentMethodLabel(p.method)} · {pesos(p.amountCents)} · {(details.appliedPrecontractPaymentIds||[]).includes(p.paymentId)?'Applied to contract':(details.precontractRefunds||[]).some(r=>r.paymentId===p.paymentId)?'Refunded':'Awaiting allocation'} <button type="button" className="btn btn-sm btn-outline-secondary" onClick={()=>setReceipt((details.appliedPrecontractPaymentIds||[]).includes(p.paymentId)&&details.account?{accountId:details.account._id,paymentId:p.paymentId}:{reservationId:details._id,paymentId:p.paymentId})}>Receipt</button></p>)}</section>}
      {details.account&&<div className="d-flex flex-wrap gap-2"><Link className="btn btn-outline-primary btn-sm" to={`/payment?account=${details.account._id}`}>Open converted account · {details.account.assignmentId}</Link>{admin&&<Link className="btn btn-outline-secondary btn-sm" to={`/commissions?account=${details.account._id}&action=configure${details.agent?`&suggestAgent=${details.agent._id}`:''}`}>Configure property commission</Link>}</div>}
      <details><summary>Activity history</summary><ul>{details.history.map((event,index)=><li key={index}>{event.action} · {event.username||'REMS'} · {new Date(event.timestamp).toLocaleString('en-PH',{timeZone:'Asia/Manila'})} {event.reason&&`· ${event.reason}`}</li>)}</ul></details>
      {admin&&(details.held||details.disposition==='OUTSTANDING')&&<form className="mt-3" onSubmit={manage}>
        <label className="form-label">Action<select className="form-select" value={action} onChange={e=>{setAction(e.target.value);setPreview(null)}}>
          <option value="">Choose action</option>
          {details.held?<><option value="EXTEND">Extend reservation</option><option value="CORRECT">Correct terms or notes</option><option value="CANCEL">Cancel reservation</option>
            {details.status==='EXPIRED'?<option value="RELEASE">Release lot</option>:details.disposition==='OUTSTANDING'?<option value="CONVERT">Convert to sale</option>:null}</>:<option value="DISPOSITION">Record fee disposition</option>}
          {!!pendingDeposits(details).length&&<option value="REFUND_PRECONTRACT">Record actual down-payment refund</option>}
        </select></label>
        {action&&<div className={action==='CONVERT'?'d-grid gap-3':'d-flex flex-wrap align-items-baseline gap-3'}>
          {action==='EXTEND'&&field(changes,setChanges,'expiresOn','New expiry',{type:'date',required:true})}
          {action==='CORRECT'&&<>{creditField(changes.creditPolicy,value=>setField(setChanges,'creditPolicy',value))}{field(changes,setChanges,'terms','Corrected terms',{required:true})}{field(changes,setChanges,'notes','Corrected notes')}</>}
          {action==='CONVERT'&&<>
            <section className="border rounded p-3"><h3 className="h6">Buyer &amp; reservation</h3><p>{clientName(details.client)} · {details.client?.clientId} · {details.client?.contactNumber||'No contact number recorded'}</p><p className="mb-0">Reservation agent: {details.agent?.fullName||'Unassigned'} · Original receipt: {details.payment.receiptNumber} · {details.payment.paymentDate} · {paymentMethodLabel(details.payment.method)} · {pesos(details.amountCents)}</p></section>
            <AssignmentFields value={changes} onChange={next=>{setChanges(next);setPreview(null)}} clientId={details.client?._id} fixedProperty={details.property} fixedProject={details.project} showPaymentPolicy/>
            <section className="border rounded p-3"><h3 className="h6">Payment credits &amp; actual new collection</h3><p className="small">Existing reservation credit: {pesos(details.paymentPurpose==='DOWN_PAYMENT'?0:details.amountCents)} · Previously received eligible down payments: {pesos(pendingDeposits(details).reduce((n,p)=>n+p.amountCents,0))}. These are not new money. Only enter additional money actually received today.</p>
            <label className="form-label">Apply reservation credit to<select required className="form-select" value={changes.installment} onChange={e=>{setField(setChanges,'installment',e.target.value);setPreview(null)}}>{details.creditPolicy!=='FIRST_INSTALLMENT'&&<option value="0">Down payment</option>}{details.creditPolicy==='FIRST_INSTALLMENT'&&<option value="1">First installment</option>}{details.creditPolicy==='ANY_PRINCIPAL'&&Array.from({length:Math.min(1200,Math.max(0,Number(changes.months)||0))},(_,i)=><option key={i+1} value={i+1}>Installment {i+1}</option>)}</select></label>
            {field(changes,setChanges,'additionalAmount','Additional money received today (₱)',{type:'number',min:0,step:'.01',required:true})}
            {Number(changes.additionalAmount)>0&&<div className="d-flex gap-3 flex-wrap">{method(changes,setChanges)}{field(changes,setChanges,'receiptNumber','Receipt for new money',{required:true})}{field(changes,setChanges,'reference','Payment reference')}</div>}
            <p className="small">Previously received down payments must be captured by the original receipt workflow; do not enter historical money as additional money today.</p>
            {liveRemainingDownPayment!==null&&<p className={'fw-semibold '+(liveRemainingDownPayment<0?'text-danger':'')}>{liveRemainingDownPayment<0?'Credits exceed the agreed down payment by ':'Remaining down payment after proposed receipts: '}{pesos(Math.abs(liveRemainingDownPayment))}</p>}
            <label className="form-check"><input type="checkbox" className="form-check-input" checked={!!changes.allowOutstanding} onChange={e=>{setField(setChanges,'allowOutstanding',e.target.checked);setPreview(null)}}/> Approved terms permit remaining scheduled down payment or installment to remain outstanding.</label></section>
          </>}
          {action==='REFUND_PRECONTRACT'&&<><label className="form-label">Original receipt<select required className="form-select" value={changes.paymentId||''} onChange={e=>setField(setChanges,'paymentId',e.target.value)}><option value="">Choose receipt to refund in full</option>{pendingDeposits(details).map(p=><option key={p.paymentId} value={p.paymentId}>{p.receiptNumber} · {pesos(p.amountCents)}</option>)}</select></label>{field(changes,setChanges,'date','Actual refund date',{type:'date',required:true,max:data?.day})}{method(changes,setChanges)}{field(changes,setChanges,'reference','Refund reference',{required:true})}</>}
          {action==='DISPOSITION'&&<>
            <label className="form-label">Fee disposition<select required className="form-select" value={changes.disposition||''} onChange={e=>setField(setChanges,'disposition',e.target.value)}>
              <option value="">Choose disposition</option><option value="REFUNDED">Record actual refund</option><option value="RETAINED">Retain under approved terms</option>
            </select></label>
            {field(changes,setChanges,'reference','Supporting agreement or refund reference',{required:true})}
            {changes.disposition==='REFUNDED'&&<>{field(changes,setChanges,'date','Actual refund date',{type:'date',required:true,max:data?.day})}{method(changes,setChanges)}</>}
          </>}
          {field(changes,setChanges,'reason','Reason',{required:true})}
          {action==='CONVERT'&&<div><button type="button" className="btn btn-outline-secondary" disabled={busy||!changes.reason?.trim()} onClick={()=>run(async()=>{await api.post(`/finance/reservations/${details._id}/manage`,{...changes,action:'DRAFT',version:details.__v,confirmed:true});setDetails(null);setPreview(null);setMessage('Draft saved. No contract activated or payment posted.');await load()})}>Save as Draft</button>{details.contractDraft&&<p className="small mt-2">Draft saved by {details.contractDraft.username}. Review all terms before activation.</p>}</div>}
          {preview&&<section className="border rounded p-3"><h3 className="h5">Review contract before activation</h3><p>{clientName(details.client)} · {details.project?.projectName} · {lotName(details.property)} · Agent: {details.agent?.fullName||'Unassigned'}</p><dl className="row"><dt className="col-sm-6">Contract total</dt><dd className="col-sm-6">{pesos(preview.contract.totalCents)}</dd><dt className="col-sm-6">Agreed down payment</dt><dd className="col-sm-6">{pesos(preview.contract.downPaymentCents)}</dd><dt className="col-sm-6">Reservation credit</dt><dd className="col-sm-6">{pesos(preview.creditCents)}</dd><dt className="col-sm-6">Previously received down payment</dt><dd className="col-sm-6">{pesos(preview.priorDownPaymentCents)}</dd><dt className="col-sm-6">New collection</dt><dd className="col-sm-6">{pesos(preview.additionalCents)}</dd><dt className="col-sm-6">Credit target / remaining target</dt><dd className="col-sm-6">{preview.target.installment===0?'Down payment':'Installment '+preview.target.installment} · {pesos(preview.remainingTargetCents)}</dd><dt className="col-sm-6">Remaining down payment</dt><dd className="col-sm-6">{pesos(preview.remainingDownPaymentCents)}</dd><dt className="col-sm-6">Outstanding principal</dt><dd className="col-sm-6">{pesos(preview.remainingPrincipalCents)}</dd><dt className="col-sm-6">Term / monthly installment</dt><dd className="col-sm-6">{preview.contract.months} months · {pesos(preview.contract.monthlyInstallmentCents)}</dd><dt className="col-sm-6">Contract date / final due</dt><dd className="col-sm-6">{preview.contract.contractDate} → {preview.contract.schedule.at(-1)?.dueDate}</dd></dl>{preview.contract.monitoringTerms&&<p>Due day {preview.contract.monitoringTerms.dueDay} · Grace {preview.contract.monitoringTerms.graceDays} days · Penalty {preview.contract.monitoringTerms.penaltyPercentage}% · Forfeiture review {preview.contract.monitoringTerms.forfeitureMonths} months · Basis {preview.contract.monitoringTerms.penaltyBasis||'Configure in Payments'}</p>}<details><summary>Approved installment schedule</summary><div className="table-responsive"><table className="table table-sm"><thead><tr><th>Period</th><th>Due date</th><th>Amount</th></tr></thead><tbody>{preview.contract.schedule.map(s=><tr key={s.installment}><td>{s.installment||'Down payment'}</td><td>{s.dueDate}</td><td>{pesos(s.amountCents)}</td></tr>)}</tbody></table></div></details><button type="button" className="btn btn-outline-secondary mt-2" onClick={()=>setPreview(null)}>Edit contract details</button></section>}
          <button className={['CANCEL','RELEASE'].includes(action)?'btn btn-outline-danger':'btn btn-primary'} disabled={busy}>{action==='CONVERT'?(preview?'Confirm conversion and payment':'Preview conversion'):'Confirm action'}</button>
        </div>}
      </form>}
    </section>}
  </section>;
}
