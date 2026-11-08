import {penaltyPolicies} from "../../../shared/penaltyPolicy.js";
import {monthDate} from "../../../shared/paymentSchedule.js";
import {calendarDay,addDays} from "../../../shared/contractTerms.js";
export {calendarDay,addDays,validateTerms,configureSchedule} from "../../../shared/contractTerms.js";
const roundedPenalty=(cents,bps)=>Number((BigInt(cents)*BigInt(bps)+5000n)/10000n);
// Single chronological ledger: assessment cycles run at the start of their PHT
// calendar date, then payments on that date. No interest-on-interest is applied.
export function calculateLedger(account,payments,asOf=calendarDay()){
 const contract=account.contract,terms=contract.monitoringTerms;
 const closedHistorical=asOf>=(account.migration?.cutoffDate||"9999-12-31")&&["CANCELLED","FORFEITED","TRANSFERRED","FULLY_PAID"].includes(account.migration?.historicalStatus);
 const policies=penaltyPolicies(account).map((p,i)=>({...p,order:i})).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.order-b.order);
 const policyAt=date=>policies.filter(p=>p.effectiveDate<=date).at(-1);
 const schedule=contract.schedule.map(s=>({...s,contractId:account.assignmentId||String(account._id||""),installmentId:`I${s.installment}`,paidCents:0,balanceCents:s.amountCents,advanceAmountCents:0}));
 const dueEvents=[];
 for(const s of schedule.filter(s=>s.installment>0&&s.amountCents>0)){
  // Keep a stable monthly anniversary across rate/status changes. A policy
  // edit cannot create an extra cycle between two scheduled anniversaries.
  const first=policies[0];if(!first)continue;
  const start=[addDays(s.dueDate,first.graceDays+1),first.effectiveDate].sort().at(-1);
  for(let n=0;n<120000;n++){
   const date=monthDate(start,n);if(date>asOf)break;
   const p=policyAt(date);
   if(!["CANCELLED","FORFEITED","TRANSFERRED","FULLY_PAID"].includes(account.migration?.historicalStatus)&&(!account.migration?.cutoffDate||date>account.migration.cutoffDate)&&p?.penaltyStatus==="ACTIVE"&&["FULL_INSTALLMENT","UNPAID_BALANCE"].includes(p.penaltyBasis)&&date>addDays(s.dueDate,p.graceDays))dueEvents.push({date,kind:"ASSESS",s,p,key:`${s.installmentId}:${date}`});
  }
 }
 const effective=payments.filter(p=>p.paymentDate<=asOf).sort((a,b)=>a.paymentDate.localeCompare(b.paymentDate)||new Date(a.createdAt||0)-new Date(b.createdAt||0)||String(a.paymentId).localeCompare(String(b.paymentId)));
 const historicalEvents=(account.historicalPenalties||[]).filter(a=>a.cycleDate<=asOf).map(a=>({date:a.cycleDate,kind:"HISTORICAL_ASSESS",a}));
 const events=[...dueEvents,...historicalEvents,...effective.map(p=>({date:p.paymentDate,kind:"PAYMENT",p}))].sort((a,b)=>a.date.localeCompare(b.date)||(a.kind===b.kind?0:a.kind!=="PAYMENT"?-1:1));
 const assessments=[],allocations={},waivers=(account.penaltyWaivers||[]).filter(w=>(w.effectiveDate||(w.timestamp?calendarDay(w.timestamp):"0000-00-00"))<=asOf);
 for(const event of events){
  if(event.kind==="HISTORICAL_ASSESS"){
   const a=event.a,waivedCents=Math.min(a.amountCents,waivers.filter(w=>w.assessmentId===a.assessmentId).reduce((n,w)=>n+w.amountCents,0));
   assessments.push({...a,waivedCents,paidCents:0,balanceCents:a.amountCents-waivedCents});continue;
  }
  if(event.kind==="ASSESS"){
   const {s,p,key,date}=event;if(s.balanceCents<=0)continue;
   const basisCents=p.penaltyBasis==="FULL_INSTALLMENT"?s.amountCents:s.balanceCents;
   const amountCents=roundedPenalty(basisCents,p.penaltyRateBps);
   if(amountCents){const waivedCents=Math.min(amountCents,waivers.filter(w=>w.assessmentId===key).reduce((n,w)=>n+w.amountCents,0));assessments.push({assessmentId:key,installmentId:s.installmentId,installment:s.installment,dueDate:s.dueDate,cycleDate:date,penaltyBasis:p.penaltyBasis,basisCents,rateBps:p.penaltyRateBps,amountCents,waivedCents,paidCents:0,balanceCents:amountCents-waivedCents})}
   continue;
  }
  const p=event.p,rows=[];let remaining=p.amountCents;
  if(p.type==="OTHER"){allocations[p.paymentId]=[{paymentId:p.paymentId,amountCents:p.amountCents,effectiveDate:p.paymentDate,allocationType:"OTHER_CHARGE"}];continue;}
  const principal=()=>{for(const s of schedule){if(p.type==="DOWN_PAYMENT"&&s.installment!==0||p.type==="INSTALLMENT"&&s.installment===0)continue;const amount=Math.min(remaining,s.balanceCents);if(amount>0){s.paidCents+=amount;s.balanceCents-=amount;if(p.paymentDate<s.dueDate&&s.installment>0)s.advanceAmountCents+=amount;remaining-=amount;rows.push({paymentId:p.paymentId,installmentId:s.installmentId,installment:s.installment,dueDate:s.dueDate,amountCents:amount,effectiveDate:p.paymentDate,allocationType:s.installment===0?"DOWN_PAYMENT":p.paymentDate<s.dueDate?"ADVANCE":"INSTALLMENT"})}}};
  const penalty=()=>{for(const a of assessments){const amount=Math.min(remaining,a.balanceCents);if(amount>0){a.balanceCents-=amount;a.paidCents+=amount;remaining-=amount;rows.push({paymentId:p.paymentId,assessmentId:a.assessmentId,installmentId:a.installmentId,installment:a.installment,dueDate:a.cycleDate,amountCents:amount,effectiveDate:p.paymentDate,allocationType:"PENALTY"})}}};
  if(p.allocationPlan?.length){
   for(const plan of p.allocationPlan){
    const amount=plan.amountCents;if(!Number.isSafeInteger(amount)||amount<=0||amount>remaining)throw Object.assign(new Error("Invalid explicit allocation amount."),{statusCode:409});
    if(plan.assessmentId){const a=assessments.find(a=>a.assessmentId===plan.assessmentId);if(!a||amount>a.balanceCents||["INSTALLMENT","DOWN_PAYMENT"].includes(p.type))throw Object.assign(new Error("Explicit penalty allocation exceeds an eligible assessed balance."),{statusCode:409});a.balanceCents-=amount;a.paidCents+=amount;rows.push({paymentId:p.paymentId,assessmentId:a.assessmentId,installmentId:a.installmentId,installment:a.installment,dueDate:a.cycleDate,amountCents:amount,effectiveDate:p.paymentDate,allocationType:"PENALTY"})}
    else {const s=schedule.find(s=>s.installmentId===plan.installmentId);if(!s||amount>s.balanceCents||p.type==="PENALTY"||(p.type==="DOWN_PAYMENT"&&s.installment!==0)||(p.type==="INSTALLMENT"&&s.installment===0))throw Object.assign(new Error("Explicit installment allocation exceeds an eligible scheduled balance."),{statusCode:409});s.balanceCents-=amount;s.paidCents+=amount;if(p.paymentDate<s.dueDate&&s.installment>0)s.advanceAmountCents+=amount;rows.push({paymentId:p.paymentId,installmentId:s.installmentId,installment:s.installment,dueDate:s.dueDate,amountCents:amount,effectiveDate:p.paymentDate,allocationType:s.installment===0?"DOWN_PAYMENT":p.paymentDate<s.dueDate?"ADVANCE":"INSTALLMENT"})}
    remaining-=amount;
   }
  }
  else if(p.paymentIntent){const intent=p.paymentIntent,selected=intent.penalties||[];if(!['NONE','NOW','LATER'].includes(intent.penaltyDecision)||!Number.isSafeInteger(intent.principalCents)||intent.principalCents<0||intent.principalCents+selected.reduce((n,a)=>n+a.amountCents,0)!==p.amountCents||new Set(selected.map(a=>a.assessmentId)).size!==selected.length)throw Object.assign(new Error('Payment intent no longer matches its amount. Review an explicit correction allocation.'),{statusCode:409});if(intent.penaltyDecision!=='NOW'&&selected.length)throw Object.assign(new Error('A deferred penalty cannot receive an allocation.'),{statusCode:409});for(const chosen of selected){const a=assessments.find(a=>a.assessmentId===chosen.assessmentId),amount=chosen.amountCents;if(!a||!Number.isSafeInteger(amount)||amount<=0||amount>a.balanceCents)throw Object.assign(new Error('Selected penalty no longer matches its assessed balance. Review the affected allocation.'),{statusCode:409});a.balanceCents-=amount;a.paidCents+=amount;remaining-=amount;rows.push({paymentId:p.paymentId,assessmentId:a.assessmentId,installmentId:a.installmentId,installment:a.installment,dueDate:a.cycleDate,amountCents:amount,effectiveDate:p.paymentDate,allocationType:'PENALTY'})}if(p.type==='PENALTY'&&remaining>0)throw Object.assign(new Error('Penalty-only intent cannot allocate principal.'),{statusCode:409});principal()}
  else if(p.type==="PENALTY"||p.type==="AUTO"&&schedule.every(s=>s.balanceCents===0))penalty();
  else if(p.type==="AUTO"&&(p.configuration?.allocationPriority||policyAt(p.paymentDate)?.allocationPriority)==="PENALTY_FIRST"){penalty();principal()}
  else {principal();if(p.type==="AUTO"&&(p.configuration?.allocationPriority||policyAt(p.paymentDate)?.allocationPriority))penalty()}
  if(remaining>0)throw Object.assign(new Error("Payment exceeds the remaining balance for its payment type. Review allocations or charges before saving."),{statusCode:409});
  allocations[p.paymentId]=rows.map(r=>({...r,contractId:account.assignmentId||String(account._id||"")}));
 }
 let consecutiveUnpaidMonths=0,maxConsecutiveUnpaidMonths=0;
 for(const s of schedule){
  const p=policyAt(s.dueDate)||terms;const graceDays=p?.graceDays??0;s.graceEnd=addDays(s.dueDate,graceDays);s.overdue=!closedHistorical&&s.balanceCents>0&&asOf>s.graceEnd;
  s.advance=s.installment>0&&s.advanceAmountCents>0;
  s.status=s.balanceCents===0?(s.advance?"PAID_IN_ADVANCE":"PAID"):s.paidCents>0&&s.dueDate>asOf?"PARTIAL_ADVANCE":s.overdue?"OVERDUE":s.dueDate>asOf?"UPCOMING_DUE":s.dueDate===asOf?"DUE_TODAY":"WITHIN_GRACE_PERIOD";
  if(closedHistorical&&s.balanceCents>0)s.status="HISTORICAL_"+account.migration.historicalStatus;
  s.penaltyHistory=assessments.filter(a=>a.installmentId===s.installmentId);
  if(s.installment>0&&s.dueDate<=asOf){if(s.balanceCents===0)consecutiveUnpaidMonths=0;else if(s.overdue)consecutiveUnpaidMonths++;maxConsecutiveUnpaidMonths=Math.max(maxConsecutiveUnpaidMonths,consecutiveUnpaidMonths)}
 }
 const current=closedHistorical?null:policyAt(asOf)||null;
 const riskStatus=current?(consecutiveUnpaidMonths>=current.forfeitureMonths?"FORFEITURE_REVIEW_REQUIRED":current.criticalMonths>0&&consecutiveUnpaidMonths>=current.criticalMonths?"CRITICAL":consecutiveUnpaidMonths>0?"WARNING":"NORMAL"):"NOT_CONFIGURED";
 const principalPaidCents=schedule.reduce((n,s)=>n+s.paidCents,0),outstandingPenaltyCents=assessments.reduce((n,a)=>n+a.balanceCents,0);
 if(![principalPaidCents,outstandingPenaltyCents,contract.totalCents-principalPaidCents+outstandingPenaltyCents].every(Number.isSafeInteger))throw Object.assign(new Error("Account totals exceed supported integer-centavo precision."),{statusCode:409});
 const next=closedHistorical?null:schedule.find(s=>s.balanceCents>0),advanceRows=closedHistorical?[]:schedule.filter(s=>s.installment>0&&s.balanceCents===0&&s.dueDate>asOf);
 let category="CURRENT";
 if(riskStatus==="FORFEITURE_REVIEW_REQUIRED")category=riskStatus;else if(riskStatus==="CRITICAL")category="CRITICAL_FORFEITURE_RISK";else if(schedule.some(s=>s.overdue))category=outstandingPenaltyCents?"OVERDUE_WITH_PENALTY":"OVERDUE";
 else if(next?.dueDate===asOf)category="DUE_TODAY";else if(next&&asOf>next.dueDate)category="WITHIN_GRACE_PERIOD";else if(advanceRows.length)category="PAID_IN_ADVANCE";else if(current&&next&&asOf>=addDays(next.dueDate,-current.reminderDays))category="UPCOMING_DUE";
 if(closedHistorical)category="HISTORICAL_"+account.migration.historicalStatus;
 return {schedule,allocations,payments:effective,assessments,principalPaidCents,balanceCents:contract.totalCents-principalPaidCents,outstandingPenaltyCents,totalOutstandingCents:contract.totalCents-principalPaidCents+outstandingPenaltyCents,
  advanceCoveredMonths:advanceRows.length,advanceCoveredThrough:schedule.filter(s=>s.installment>0&&s.balanceCents===0&&s.advance).at(-1)?.dueDate||null,nextUnpaidDueDate:next?.dueDate||null,consecutiveUnpaidMonths,maxConsecutiveUnpaidMonths,riskStatus,category};
}
