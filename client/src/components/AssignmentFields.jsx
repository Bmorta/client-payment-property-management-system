import FeedbackMessage from "./FeedbackMessage.jsx";
import {default as FieldLabel} from "./FieldLabel.jsx";
import RequiredMark from "./RequiredMark.jsx";
import { useEffect, useState } from "react";
import ContractTerms from "./ContractTerms.jsx";
import TermSelector from "./TermSelector.jsx";
import PaymentEstimate from "./PaymentEstimate.jsx";
import { moneyCents } from "../../../shared/paymentSchedule.js";
import api from "../services/api.js";
import { money, lotPrice } from "../utils/lotPricing.js";
import { localDate } from "../utils/finance.js";
export const blankAssignment = () => ({ projectId: "", phase: "", block: "", propertyId: "", months: "12", termType: "PREDEFINED", contractDate: localDate(), firstDueDate: "", downPayment: "0", monitoringTerms:null });
export default function AssignmentFields({ value, onChange, refreshKey = 0, clientId = "" }) {
  const [projects, setProjects] = useState([]), [lots, setLots] = useState([]), [error, setError] = useState(""), [loading, setLoading] = useState(false);
  useEffect(() => { let cancelled = false; api.get("/projects").then(({ data }) => { if (!cancelled) setProjects(data.data.filter(p => p.status !== "ARCHIVED")); }).catch(() => { if (!cancelled) setError("Unable to load projects. Reload the page."); }); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    let cancelled = false; setLots([]);
    if (!value.projectId) { setLoading(false); return; }
    setLoading(true); setError("");
    api.get(`/projects/${value.projectId}/properties`).then(({ data }) => { if (!cancelled) setLots(data.data.filter(p => !p.hasAccount && ((p.status === "AVAILABLE" && !p.client) || (clientId && p.client === clientId && p.status === "RESERVED")))); })
      .catch(() => { if (!cancelled) setError("Unable to load available lots."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [value.projectId, refreshKey, clientId]);
  const set = (key, next) => onChange({ ...value, [key]: next, ...(key === "propertyId" ? { expectedAreaSqm: lots.find(p => p._id === next)?.areaSqm, expectedPricePerSqm: lots.find(p => p._id === next)?.pricePerSqm } : {}), ...(key === "projectId" ? { phase: "", block: "", propertyId: "" } : key === "phase" ? { block: "", propertyId: "" } : key === "block" ? { propertyId: "" } : {}) });
  const phases = [...new Set(lots.map(p => p.phaseNumber))].sort((a,b) => a-b);
  const blocks = [...new Set(lots.filter(p => String(p.phaseNumber) === value.phase).map(p => p.blockNumber))].sort((a,b) => a-b);
  const options = lots.filter(p => String(p.phaseNumber) === value.phase && String(p.blockNumber) === value.block);
  const lot = lots.find(p => p._id === value.propertyId);
  let totalCents = null;
  try { const price = lot && lotPrice(lot.areaSqm, lot.pricePerSqm); if (price != null) totalCents = moneyCents(price); } catch { /* Unsupported price remains an explicit empty preview. */ }
  return <div className="row g-3">
    <FeedbackMessage kind="error" message={error}/>
    {[["projectId", "Project", projects.map(p => [p._id, p.projectName])], ["phase", "Phase", phases.map(n => [n, `Phase ${n}`])], ["block", "Block", blocks.map(n => [n, `Block ${n}`])], ["propertyId", "Lot", options.map(p => [p._id, `Lot ${p.lotNumber} · ${p.areaSqm ?? "?"} sqm`])]].map(([key, label, choices]) => <div className="col-12 col-sm-6" key={key}>
      <FieldLabel className="form-label w-100">{label}<RequiredMark/><select aria-label={`Assignment ${label}`} className="form-select" required value={value[key]} onChange={e => set(key, e.target.value)}><option value="">Select {label.toLowerCase()}</option>{choices.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></FieldLabel>
    </div>)}
    {loading && <p role="status">Loading available lots...</p>}
    {value.projectId && !loading && !lots.length && <p className="text-secondary small">No available, unassigned lots in this project.</p>}
    {lot && <p className="small mb-0">Lot price: <strong>{money(lotPrice(lot.areaSqm, lot.pricePerSqm))}</strong>. Each account keeps the agreed price when assigned.</p>}
    <TermSelector value={value} onChange={onChange}/>
    <div className="col-sm-6"><FieldLabel className="form-label w-100">Planned down payment (₱)<RequiredMark/><input className="form-control" type="number" min="0" step="0.01" required value={value.downPayment} onChange={e => set("downPayment", e.target.value)} /></FieldLabel></div>
    <div className="col-sm-6"><FieldLabel className="form-label w-100">Contract date<RequiredMark/><input className="form-control" type="date" required max={localDate()} value={value.contractDate} onChange={e => set("contractDate", e.target.value)} /></FieldLabel></div>
    <div className="col-sm-6"><FieldLabel className="form-label w-100">First installment due<RequiredMark/><input className="form-control" type="date" required min={value.contractDate} value={value.firstDueDate} onChange={e => set("firstDueDate", e.target.value)} /></FieldLabel></div>
    <ContractTerms totalCents={totalCents} value={value} onChange={onChange}/>
    <div className="col-12"><PaymentEstimate monitoringTerms={value.monitoringTerms} monthlyInstallment={value.monthlyInstallment} totalCents={totalCents} months={value.months} termType={value.termType} downPayment={value.downPayment} firstDueDate={value.firstDueDate} contractDate={value.contractDate} propertyLabel={lot ? `Phase ${lot.phaseNumber} / Block ${lot.blockNumber} / Lot ${lot.lotNumber}` : ""} /></div>
    <p className="small text-secondary">The down payment is scheduled, not marked paid. Record actual money received through Payment.</p>
  </div>;
}
