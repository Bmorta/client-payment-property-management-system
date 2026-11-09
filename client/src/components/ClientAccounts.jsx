import CancellationReviewHold from './CancellationReviewHold.jsx';
import ForfeitureActions from './ForfeitureActions.jsx';
import CancellationWorkspace from './CancellationWorkspace.jsx';
import LotTransfer from './LotTransfer.jsx';
import ConsolidatedClientAccount from './ConsolidatedClientAccount.jsx';
import PaymentSchedulePrint from "./PaymentSchedulePrint.jsx";
import {useSearchParams} from "react-router-dom";
import PropertyPaymentDetails from "./PropertyPaymentDetails.jsx";
import {RequiredNote} from "./FieldLabel.jsx";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api.js";
import AssignmentFields, { blankAssignment } from "./AssignmentFields.jsx";
import AgreementEditor from "./AgreementEditor.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import SettlementReview,{SettlementBadge} from './SettlementReview.jsx';
import AccountMonitoringDetails from "./AccountMonitoringDetails.jsx";
import PropertyPaymentHistory from "./PropertyPaymentHistory.jsx";
import CenterPopup from "./CenterPopup.jsx";
import { pesos, clientName, lotName } from "../utils/finance.js";
export default function ClientAccounts({ client, refreshKey = 0 }) {
  const { user } = useAuth();const [params,setParams]=useSearchParams();
  const [allProperties,setAllProperties]=useState(false);
  const [editingAgreement,setEditingAgreement]=useState(null);
  const [accounts, setAccounts] = useState([]), [form, setForm] = useState(blankAssignment), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [version, setVersion] = useState(0);
  useEffect(() => { let cancelled = false; setLoading(true); api.get(`/finance/accounts?client=${client._id}`).then(({ data }) => { if (!cancelled) {setAccounts(data.data);if(!params.get("account")&&data.data[0])setParams(p=>{const n=new URLSearchParams(p);n.set("account",data.data[0]._id);return n},{replace:true});} }).catch(e => { if (!cancelled) setError(e.response?.data?.message || "Unable to load client accounts."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [client._id, version, refreshKey]);
  const assign = async e => {
    e.preventDefault(); if (!form.propertyId) return;
    setBusy(true);
    try { const { data } = await api.post(`/clients/${client._id}/assignments`, form); setForm(blankAssignment()); setVersion(v => v+1); setMessage(data.message); }
    catch(e) { setError(e.response?.data?.message || "Unable to assign lot. Refresh accounts before retrying."); }
    finally { setBusy(false); }
  };
  return <section className="card border-0 shadow-sm mt-4"><div className="card-body"><div className="d-flex gap-2 mb-3"><button type="button" className={allProperties?'btn btn-outline-primary':'btn btn-primary'} onClick={()=>setAllProperties(false)}>Individual Property View</button><button type="button" className={allProperties?'btn btn-primary':'btn btn-outline-primary'} onClick={()=>setAllProperties(true)}>View All Properties / Consolidated Account</button></div>{allProperties&&<ConsolidatedClientAccount clientId={client._id} refreshKey={version+refreshKey} onSaved={m=>{setMessage(m);setVersion(v=>v+1)}}/>}
    <h2 className="h5 fw-bold">Properties & accounts — {clientName(client)}</h2>
    <CenterPopup message={message} error={error} onClose={() => { setMessage(""); setError(""); }} />
    <CancellationWorkspace client={client} accounts={accounts} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/>{loading ? <p role="status">Loading accounts...</p> : !accounts.length ? <p className="text-secondary">No assigned lots yet.</p> : !allProperties&&accounts.map(a => <details key={a._id} className="border rounded p-3 mb-3" open={params.get("account")===a._id} onToggle={e=>{if(e.currentTarget.open&&params.get("account")!==a._id)setParams(p=>{const n=new URLSearchParams(p);n.set("account",a._id);return n},{replace:true})}}>
      <summary><strong>{a.project?.projectName} — {lotName(a.property)}</strong><span className="d-block small mt-1">{a.assignmentId} · {a.contract.termType === "CUSTOM" ? "Custom " : ""}{a.contract.months} months · Balance {pesos(a.summary.balanceCents)} · {a.summary.alert.replaceAll("_", " ")}</span><SettlementBadge settlement={a.summary.settlement}/></summary>
      {a.migrationProgress&&!a.migration&&<p className="alert alert-warning small">Historical migration: {a.migrationProgress.status.replaceAll("_"," ")} · Cutoff {a.migrationProgress.cutoffDate}. Drafts have not been posted to this live ledger.</p>}{a.migration&&<p className="alert alert-info small">Historical migration: Completed · Cutoff {a.migration.cutoffDate} · Documented status {a.migration.historicalStatus}. Original financial dates are preserved.</p>}<div className="d-flex flex-wrap gap-3 my-3"><span>Contract: {pesos(a.contract.totalCents)}</span><span>Paid: {pesos(a.summary.paidCents)}</span><span>Overdue: {pesos(a.summary.overdueCents)}</span>{!a.pendingCancellation&&a.summary.settlement?.status!=="SETTLED"&&!["TRANSFERRED","CANCELLED","FORFEITED","SUPERSEDED"].includes(a.lifecycle)&&<Link to={`/payment?account=${a._id}`} className="btn btn-sm btn-primary">{a.summary.settlement?.status==="PRINCIPAL_FULLY_PAID"?"Pay Outstanding Charges":"Accept Payment"}</Link>}</div>
      {user?.role === "ADMIN" && !a.pendingCancellation&&!["TRANSFERRED","CANCELLED","FORFEITED","SUPERSEDED"].includes(a.lifecycle) && <button type="button" className="btn btn-sm btn-outline-primary my-2" onClick={() => setEditingAgreement(a._id)}>Edit Payment Agreement</button>}
      {editingAgreement === a._id && <AgreementEditor key={`${a._id}/${a.__v}`} account={a} onClose={() => setEditingAgreement(null)} onSaved={() => {setEditingAgreement(null);setVersion(v=>v+1);setMessage("Agreement updated. Recorded payments are unchanged.")}} />}
      <PaymentSchedulePrint accountId={a._id}/><PropertyPaymentDetails account={a}/><LotTransfer account={a} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/>
      <ForfeitureActions account={a} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/>
      <CancellationReviewHold account={a} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/><SettlementReview account={a} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/><AccountMonitoringDetails account={a} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/>
      <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Installment</th><th>Due date</th><th>Scheduled</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{a.summary.schedule.map(s => <tr key={s.installment}><td>{s.installment === 0 ? "Down payment" : s.installment}</td><td>{s.dueDate}</td><td>{pesos(s.amountCents)}</td><td>{pesos(s.paidCents)}</td><td>{pesos(s.balanceCents)}</td><td>{["FORFEITED","SUPERSEDED"].includes(a.lifecycle)&&s.balanceCents>0?"Historical — closed":!s.balanceCents ? "Paid" : s.penaltyReview ? "Overdue with penalty" : s.overdue ? "Overdue" : "Scheduled"}</td></tr>)}</tbody></table></div>
      <PropertyPaymentHistory account={a} onSaved={message=>{setMessage(message);setVersion(v=>v+1)}}/>
    </details>)}
    {client.status === "ACTIVE" && <details className="border rounded p-3"><summary className="fw-semibold">Assign another property</summary><form onSubmit={assign} className="mt-3"><RequiredNote/><fieldset disabled={busy}><AssignmentFields clientId={client._id} value={form} onChange={setForm} refreshKey={version} /><button className="btn btn-primary mt-2" disabled={!form.propertyId || busy}>{busy ? "Assigning..." : "Assign Lot & Create Schedule"}</button></fieldset></form></details>}
  </div></section>;
}
