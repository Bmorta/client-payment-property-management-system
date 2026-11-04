import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api.js";
import AssignmentFields, { blankAssignment } from "./AssignmentFields.jsx";
import CenterPopup from "./CenterPopup.jsx";
import { pesos, clientName, lotName } from "../utils/finance.js";
export default function ClientAccounts({ client, refreshKey = 0 }) {
  const [accounts, setAccounts] = useState([]), [form, setForm] = useState(blankAssignment), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(""), [version, setVersion] = useState(0);
  useEffect(() => { let cancelled = false; setLoading(true); api.get(`/finance/accounts?client=${client._id}`).then(({ data }) => { if (!cancelled) setAccounts(data.data); }).catch(e => { if (!cancelled) setError(e.response?.data?.message || "Unable to load client accounts."); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [client._id, version, refreshKey]);
  const assign = async e => {
    e.preventDefault(); if (!form.propertyId) return;
    setBusy(true);
    try { const { data } = await api.post(`/clients/${client._id}/assignments`, form); setForm(blankAssignment()); setVersion(v => v+1); setMessage(data.message); }
    catch(e) { setError(e.response?.data?.message || "Unable to assign lot. Refresh accounts before retrying."); }
    finally { setBusy(false); }
  };
  return <section className="card border-0 shadow-sm mt-4"><div className="card-body">
    <h2 className="h5 fw-bold">Properties & accounts — {clientName(client)}</h2>
    <CenterPopup message={message} error={error} onClose={() => { setMessage(""); setError(""); }} />
    {loading ? <p role="status">Loading accounts...</p> : !accounts.length ? <p className="text-secondary">No assigned lots yet.</p> : accounts.map(a => <details key={a._id} className="border rounded p-3 mb-3">
      <summary><strong>{a.project?.projectName} — {lotName(a.property)}</strong><span className="d-block small mt-1">{a.assignmentId} · {a.contract.months} months · Balance {pesos(a.summary.balanceCents)} · {a.summary.alert.replaceAll("_", " ")}</span></summary>
      <div className="d-flex flex-wrap gap-3 my-3"><span>Contract: {pesos(a.contract.totalCents)}</span><span>Paid: {pesos(a.summary.paidCents)}</span><span>Overdue: {pesos(a.summary.overdueCents)}</span><Link to={`/payment?account=${a._id}`} className="btn btn-sm btn-primary">Accept Payment</Link></div>
      <p className="text-secondary small">Payments go to the oldest scheduled balance first. Penalty charges are pending the percentage rule. Warnings start at 2 overdue installments; 3 require forfeiture review.</p>
      <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Installment</th><th>Due date</th><th>Scheduled</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>{a.summary.schedule.map(s => <tr key={s.installment}><td>{s.installment === 0 ? "Down payment" : s.installment}</td><td>{s.dueDate}</td><td>{pesos(s.amountCents)}</td><td>{pesos(s.paidCents)}</td><td>{pesos(s.balanceCents)}</td><td>{!s.balanceCents ? "Paid" : s.penaltyReview ? "Overdue >10 days" : s.overdue ? "Overdue" : "Scheduled"}</td></tr>)}</tbody></table></div>
      <h3 className="h6">Payment history</h3>{!a.payments.length ? <p className="text-secondary small">No payments recorded.</p> : <div className="table-responsive"><table className="table table-sm"><thead><tr><th>Payment ID</th><th>Date</th><th>Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>{a.payments.map(p => <tr key={p.paymentId}><td>{p.paymentId}</td><td>{p.paymentDate}</td><td>{pesos(p.amountCents)}</td><td>{p.method.replaceAll("_", " ")}</td><td>{p.reference || "—"}</td></tr>)}</tbody></table></div>}
    </details>)}
    {client.status === "ACTIVE" && <details className="border rounded p-3"><summary className="fw-semibold">Assign another property</summary><form onSubmit={assign} className="mt-3"><fieldset disabled={busy}><AssignmentFields clientId={client._id} value={form} onChange={setForm} refreshKey={version} /><button className="btn btn-primary mt-2" disabled={!form.propertyId || busy}>{busy ? "Assigning..." : "Assign Lot & Create Schedule"}</button></fieldset></form></details>}
  </div></section>;
}
