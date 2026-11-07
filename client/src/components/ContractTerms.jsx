import {useId} from "react";
import FieldHelp from "./FieldHelp.jsx";
import RequiredMark from "./RequiredMark.jsx";
const explanations={
 monthlyInstallment:"Scheduled monthly principal, excluding penalties. The amount and term must cover the contract balance; the final installment may be smaller.",
 dueDay:"The day each month payment is due. Days 29–31 use the month’s last day when necessary.",
 graceDays:"Calendar days after the due date with no new penalty. Due on the 5th plus 5 grace days is penalty-free through the 10th; penalties can start on the 11th.",
 penaltyPercentage:"Percentage assessed per eligible unpaid installment each monthly cycle. Fully paid or advance-covered installments are excluded.",
 forfeitureMonths:"Consecutive unpaid installments after grace before administrator review is required. Paid/advance-covered installments break the sequence; no automatic forfeiture or lot release occurs.",
 criticalMonths:"Early warning before forfeiture review. Set this below the review threshold, or enter 0 to disable it.",
 reminderDays:"Days before an unpaid installment is due to show a reminder. Enter 0 for due-day alerts only; advance-covered installments are excluded.",
 penaltyStatus:"Active assesses eligible new monthly penalties. Waived/Disabled stops new assessments from the effective date; existing charges still need payment, an explicit admin waiver or a valid reversal.",
 penaltyBasis:"Full installment uses its scheduled amount; Unpaid balance uses only the unpaid portion. Example: ₱3,030 less ₱2,000 paid, at 3%: ₱90.90 full basis or ₱30.90 unpaid basis.",
 allocationPriority:"Principal first pays scheduled installments before assessed penalties. Penalty first does the reverse. Explicit Down Payment, Installment or Penalty types restrict their targets; review the preview.",
 frequency:"Monthly, simple and non-compounding. Existing penalties do not earn penalties, and paying principal does not erase earlier assessed charges.",
 effectiveDate:"Date these contract rules take effect, not before the contract date. Unpaid principal and expired grace are still required; existing monthly penalty anniversaries are preserved."
};
export default function ContractTerms({value,onChange,existing=false,showPaymentPolicy=false}){
 const prefix=useId(),terms=value.monitoringTerms,set=(key,next)=>onChange({...value,monitoringTerms:{...terms,...(["penaltyStatus","penaltyBasis","allocationPriority"].includes(key)?{pendingPaymentPolicy:false}:{}),[key]:next}});
 const heading=(key,label,required=true)=><div className="field-label-row"><label className="form-label" htmlFor={`${prefix}-${key}`}>{label}{required&&<RequiredMark/>}</label><FieldHelp label={label}>{explanations[key]}</FieldHelp></div>;
 return <section className="col-12 border-top pt-3"><h3 className="h6">Payment Terms, Penalty & Forfeiture Configuration</h3>
  <label className="form-check mb-3"><input type="checkbox" className="form-check-input" checked={!!terms} disabled={existing} onChange={e=>onChange({...value,monitoringTerms:e.target.checked?{frequency:"MONTHLY",pendingPaymentPolicy:true,penaltyBasis:null,allocationPriority:null,penaltyStatus:"DISABLED",effectiveDate:value.contractDate||"",dueDay:"",graceDays:"",penaltyPercentage:"",forfeitureMonths:"",criticalMonths:"",reminderDays:""}:null,...(!e.target.checked?{monthlyInstallment:undefined}:{})})}/>Configure this property's contractual monitoring terms</label>
  {!terms?<p className="small text-secondary">No automatic penalty will be charged without explicit contract configuration.</p>:<><p className="required-note"><span aria-hidden="true">*</span> Required. Hover, focus or tap an information icon <span className="help-example" aria-hidden="true">i</span> for an explanation.</p><div className="row g-3">
   <div className="col-sm-6">{heading("monthlyInstallment","Monthly installment (₱)")}<input id={`${prefix}-monthlyInstallment`} required className="form-control" type="number" min="0.01" step="0.01" value={value.monthlyInstallment||""} onChange={e=>onChange({...value,monthlyInstallment:e.target.value})}/></div>
   {[["dueDay","Monthly payment due day",1,31],["graceDays","Grace period (calendar days)",0,366],["penaltyPercentage","Penalty percentage (%)",0,100],["forfeitureMonths","Consecutive unpaid months before review",1,1200],["criticalMonths","Critical warning threshold (months; 0 disables)",0,1200],["reminderDays","Reminder days before due",0,366]].map(([key,label,min,max])=><div className="col-sm-6" key={key}>{heading(key,label)}<input id={`${prefix}-${key}`} required className="form-control" type="number" min={min} max={max} step={key==="penaltyPercentage"?"0.01":"1"} value={terms[key]} onChange={e=>set(key,e.target.value)}/></div>)}
   {showPaymentPolicy&&[["penaltyStatus","Penalty status",["ACTIVE","WAIVED","DISABLED"]],["penaltyBasis","Penalty basis",["FULL_INSTALLMENT","UNPAID_BALANCE"]],["allocationPriority","Automatic payment priority",["PRINCIPAL_FIRST","PENALTY_FIRST"]]].map(([key,label,options])=><div className="col-sm-6" key={key}>{heading(key,label)}<select id={`${prefix}-${key}`} required className="form-select" value={terms[key]||""} onChange={e=>set(key,e.target.value)}><option value="">Choose explicitly</option>{options.map(option=><option key={option} value={option}>{option.replaceAll("_"," ")}</option>)}</select></div>)}
   {!showPaymentPolicy&&<p className="small text-secondary">Penalty basis, status and allocation priority are managed in Payments. New monitoring terms remain penalty-disabled until an administrator explicitly configures their policy there.</p>}
   <div className="col-sm-6">{heading("frequency","Penalty frequency",false)}<input id={`${prefix}-frequency`} readOnly className="form-control" value="Monthly (simple, non-compounding)"/></div>
   <div className="col-sm-6">{heading("effectiveDate","Terms / penalty effective date")}<input id={`${prefix}-effectiveDate`} required type="date" className="form-control" min={value.contractDate} value={terms.effectiveDate} onChange={e=>set("effectiveDate",e.target.value)}/></div>
   <p className="small text-secondary">Due days 29–31 clamp to the month's last day. The final installment may be smaller to preserve the contract total. Waived/Disabled status stops new assessments from its effective date; existing charges need an explicit waiver.</p>
  </div></>}
 </section>;
}
