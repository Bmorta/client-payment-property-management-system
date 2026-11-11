import FinancialCorrection from "./FinancialCorrection.jsx";
import {agreementSchedule} from "../../../shared/agreementSchedule.js";
import {revealTarget} from "../utils/navigation.js";
import {default as FieldLabel} from "./FieldLabel.jsx";
import RequiredMark from "./RequiredMark.jsx";
import FieldHelp from "./FieldHelp.jsx";
import ContractTerms from "./ContractTerms.jsx";
import {configureSchedule,validateTerms} from "../../../shared/contractTerms.js";
import { useEffect, useRef, useId, useState } from "react";
import api from "../services/api.js";
import { TERMS, buildSchedule, moneyCents } from "../../../shared/paymentSchedule.js";
import TermSelector from "./TermSelector.jsx";
import PaymentEstimate from "./PaymentEstimate.jsx";
import CenterPopup from "./CenterPopup.jsx";
import { lotName } from "../utils/finance.js";
export default function AgreementEditor({ account, onSaved, onClose, showPaymentPolicy=false }) {
  const reasonId=useId(),editorRef=useRef(null);useEffect(()=>revealTarget(editorRef.current),[]);
  const [form, setForm] = useState(() => ({ contractDate:account.contract.contractDate,months: String(account.contract.months), termType: account.contract.termType === "CUSTOM" || !TERMS.includes(account.contract.months) ? "CUSTOM" : "PREDEFINED", downPayment: String(account.contract.downPaymentCents / 100), monitoringTerms:account.contract.monitoringTerms||null,monthlyInstallment:String((account.contract.monthlyInstallmentCents||account.contract.schedule.find(s=>s.installment>0)?.amountCents||0)/100),reason:"",firstDueDate: account.contract.firstDueDate }));
  const [confirm,setConfirm]=useState(false),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const review = e => {
    e.preventDefault();
    try { agreementSchedule({...account.contract,transferIn:account.transferIn},form,validateTerms(form.monitoringTerms,account.contract.contractDate)); setConfirm(true); }
    catch(e){setError(e.message)}
  };
  const save = async () => {
    setConfirm(false);setBusy(true);
    try { await api.patch(`/finance/accounts/${account._id}/agreement`, {...form,expectedVersion:account.__v??0,confirmScheduleReplacement:true});onSaved(); }
    catch(e){setError(e.response?.data?.message||"Agreement result is uncertain. Reload accounts and review activity before retrying.")}
    finally{setBusy(false)}
  };
  return <div className="border rounded p-3 my-3"><h3 className="h6 fw-bold">Edit Payment Agreement</h3>
    <p className="small text-secondary">The property and contract price are fixed. Saving replaces this account's schedule and preserves the previous agreement version. Recorded payment transactions are kept unchanged.</p>{!!account.transferIn?.creditCents&&<p className="alert alert-info small">The approved down payment and transferred credit remain fixed here. Changing their allocation requires a reviewed contract amendment.</p>}
    <CenterPopup error={error} confirm={confirm?"Replace this payment schedule? The previous agreement will be preserved and the change audited. Existing payments will not be deleted or changed.":null} confirmTitle="Confirm agreement update" confirmLabel="Save Agreement" onClose={()=>{setError("");setConfirm(false)}} onConfirm={save}/>
    <FinancialCorrection account={account} onSaved={onSaved}/><form ref={editorRef} onSubmit={review}><fieldset disabled={busy}><div className="row g-3"><TermSelector value={form} onChange={setForm}/>
      <div className="col-sm-6"><FieldLabel className="form-label w-100">Down Payment (₱)<RequiredMark/><input aria-label="Agreement down payment" readOnly={!!account.transferIn?.creditCents} className="form-control" type="number" min="0" max={account.contract.totalCents/100} step="0.01" required value={form.downPayment} onChange={e=>setForm({...form,downPayment:e.target.value})}/></FieldLabel></div>
      <div className="col-sm-6"><FieldLabel className="form-label w-100">First installment due<RequiredMark/><input aria-label="Agreement first due date" className="form-control" type="date" min={account.contract.contractDate} required value={form.firstDueDate} onChange={e=>setForm({...form,firstDueDate:e.target.value})}/></FieldLabel></div>
    <ContractTerms transferCreditCents={account.transferIn?.creditCents||0} totalCents={account.contract.totalCents} showPaymentPolicy={showPaymentPolicy} value={form} onChange={setForm} existing={!!account.contract.monitoringTerms}/>
    <div className="col-12"><div className="field-label-row"><label className="form-label" htmlFor={reasonId}>Reason for agreement change{!!form.monitoringTerms&&<RequiredMark/>}</label><FieldHelp label="Reason for agreement change">Records why an administrator is changing this saved agreement. The reason stays with its audit history. It is required when contractual monitoring terms are configured.</FieldHelp></div><input id={reasonId} className="form-control" required={!!form.monitoringTerms} minLength="5" maxLength="500" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div>
    </div><PaymentEstimate contract={{...account.contract,transferIn:account.transferIn}} agreementInput={form} monitoringTerms={form.monitoringTerms} monthlyInstallment={form.monitoringTerms?form.monthlyInstallment:undefined} totalCents={account.contract.totalCents} months={form.months} termType={form.termType} downPayment={form.downPayment} firstDueDate={form.firstDueDate} contractDate={account.contract.contractDate} propertyLabel={lotName(account.property)}/>
      <div className="d-flex gap-2"><button className="btn btn-primary">{busy?"Saving...":"Review Agreement Changes"}</button><button className="btn btn-outline-secondary" type="button" onClick={onClose}>Cancel agreement edit</button></div>
    </fieldset></form>
  </div>;
}
