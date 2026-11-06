import RequiredMark from "./RequiredMark.jsx";
import { TERMS, MAX_TERM_MONTHS } from "../../../shared/paymentSchedule.js";
export default function TermSelector({ value, onChange }) {
  return <>
    <div className="col-sm-6"><label className="form-label w-100">Payment Term<RequiredMark/><select required aria-label="Installment term" className="form-select" value={value.termType === "CUSTOM" ? "CUSTOM" : value.months} onChange={e => onChange({ ...value, termType: e.target.value === "CUSTOM" ? "CUSTOM" : "PREDEFINED", months: e.target.value === "CUSTOM" ? "" : e.target.value })}>{TERMS.map(n => <option key={n} value={n}>{n} months</option>)}<option value="CUSTOM">Custom Term</option></select></label></div>
    {value.termType === "CUSTOM" && <div className="col-sm-6"><label className="form-label w-100">Number of Months<RequiredMark/><input aria-label="Number of Months" type="number" className="form-control" min="1" max={MAX_TERM_MONTHS} step="1" required value={value.months} onChange={e => onChange({ ...value, months: e.target.value })} /></label></div>}
  </>;
}
