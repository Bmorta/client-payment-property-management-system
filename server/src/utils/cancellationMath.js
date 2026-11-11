import {assertFinancialCorrectionDate} from "./financialCorrectionLedger.js";
import {commissionWorkflowReview} from './commissionWorkflowWarnings.js';
import {moneyCents,validDate,monthDate,validTerm} from '../../../shared/paymentSchedule.js';
import {allocatePayments} from './paymentLedger.js';
import {currentPenaltyPolicy} from '../../../shared/penaltyPolicy.js';
import {fail} from './financialReporting.js';
export const amount=v=>moneyCents(v??0);
export const note=(v,label,required=true)=>{const s=String(v||'').trim();if(s.length>1000||required&&s.length<5)fail(label+' must contain 5–1000 characters.');return s};
function requireReviewedPolicy(account){const policy=currentPenaltyPolicy(account);if(!policy||!['ACTIVE','DISABLED','WAIVED'].includes(policy.penaltyStatus)||!Number.isSafeInteger(policy.graceDays)||policy.graceDays<0||policy.penaltyStatus==='ACTIVE'&&(policy.pendingPaymentPolicy||!['FULL_INSTALLMENT','UNPAID_BALANCE'].includes(policy.penaltyBasis)||!Number.isSafeInteger(policy.penaltyRateBps)))fail('Configure/review the actual penalty policy in the existing contract/Payments workflow first. An unknown penalty is not assumed to be zero.',409);}
export function sourceEntitlement(account,input,effectiveDate,verifiedInheritedCreditCents=0){
 assertFinancialCorrectionDate(account,effectiveDate);
 requireReviewedPolicy(account);
 if(input.priorDispositionsConfirmed!==true)fail('Confirm that previous refunds and credits, including external releases, were reconciled before creating another entitlement.');
 if(!Number.isSafeInteger(verifiedInheritedCreditCents)||verifiedInheritedCreditCents<0)fail('Verified inherited credit is invalid.');
 const ledger=allocatePayments(account,effectiveDate),principalCents=verifiedInheritedCreditCents+Object.values(ledger.allocations).flat().filter(a=>['DOWN_PAYMENT','INSTALLMENT','ADVANCE'].includes(a.allocationType)).reduce((n,a)=>n+a.amountCents,0);
 if(ledger.currentPenaltySummary?.reviewIssues?.length||ledger.penaltyCalculationRule==='LEGACY_RECURRING'&&ledger.outstandingPenaltyCents>0)fail('Resolve penalty reconciliation warnings or legacy assessments before approving cancellation value.',409);
 const percentage=input.option==='THIRTY'?30:input.option==='FULL'?100:null;if(percentage===null&&input.option!=='CUSTOM')fail('Select 30%, 100% or custom value.');
 const grossCents=input.option==='CUSTOM'||input.option==='FULL'&&input.customAmount!==undefined&&input.customAmount!==''?amount(input.customAmount):Number((BigInt(principalCents)*BigInt(percentage)+50n)/100n);if(grossCents>principalCents)fail('Cancellation value exceeds eligible actual principal and down-payment allocations.');
 const justification=note(input.justification,'Custom/adjusted value justification',input.option==='CUSTOM'||grossCents<principalCents&&input.option==='FULL'),penaltyCents=ledger.outstandingPenaltyCents;
 if(!['DEDUCT','WAIVE','SETTLED'].includes(input.penaltyDecision))fail('Choose penalty deduction, waiver or already settled.');if(input.penaltyDecision==='SETTLED'&&penaltyCents)fail('Settle penalties through Payments before this decision.');
 const penaltyDeductionCents=input.penaltyDecision==='DEDUCT'?penaltyCents:0;if(penaltyDeductionCents>grossCents)fail('Penalties exceed the proposed cancellation value. Administrator review is required; no negative credit is created.');
 const netCents=grossCents-penaltyDeductionCents,legal=input.legalReview||{},legalMinimumCents=amount(legal.minimumAmount);
 if(legal.minimumAmount===undefined||legal.minimumAmount==='')fail('Record the reviewed minimum cancellation entitlement, including an explicit zero when applicable.');
 if(!['APPLIES','NOT_APPLICABLE','VOLUNTARY_SETTLEMENT'].includes(legal.basis))fail('Record the legal/contractual review basis.');
 const legalReference=note(legal.reference,'Legal/contractual review reference');if(netCents<legalMinimumCents)fail('The proposed net entitlement is below the reviewed required minimum. Revise the policy amount or penalty decision.');
 const commissions=commissionWorkflowReview(account,ledger,{asOf:effectiveDate});
 if(input.commissionDecision!=='RETAIN_ACTUAL_EARNED')fail('Explicitly approve retaining original actual earnings and payouts; no automatic reversal is permitted.');
 return {accountId:String(account._id),assignmentId:account.assignmentId,project:account.project,property:account.property,originalPriceCents:account.contract.totalCents,principalCents,verifiedInheritedCreditCents,downPaymentPaidCents:ledger.schedule.find(s=>s.installment===0)?.paidCents||0,oldBalanceCents:ledger.balanceCents,penaltyCents,option:input.option,percentage,grossCents,penaltyDeductionCents,netCents,retainedByPolicyCents:principalCents-grossCents,justification,penaltyDecision:input.penaltyDecision,legalReview:{basis:legal.basis,minimumCents:legalMinimumCents,reference:legalReference,refundInstallmentsAllowed:legal.refundInstallmentsAllowed===true},commissionDecision:input.commissionDecision,commissions,schedule:ledger.schedule,payments:account.payments||[],beforeLedger:ledger,clearanceRequested:input.clearance===true,clearanceReason:note(input.clearanceReason,'Inventory clearance',input.clearance===true)};
}
export function receivingAmendment(account,input,effectiveDate){
 assertFinancialCorrectionDate(account,effectiveDate);
 requireReviewedPolicy(account);
 const ledger=allocatePayments(account,effectiveDate),creditCents=amount(input.amount);if(!creditCents||creditCents>ledger.balanceCents)fail('Receiving credit must be positive and no more than that contract’s unpaid principal.');
 if(ledger.currentPenaltySummary?.reviewIssues?.length)fail('Resolve receiving-account penalty reconciliation warnings first.',409);
 if(ledger.outstandingPenaltyCents)fail('Settle or waive receiving-account penalties before applying a schedule amendment. They cannot silently disappear into the credit.');
 if(account.penaltyCalculationRule!=='CURRENT_OVERDUE')fail('Reconcile the receiving account to the current penalty rule before amending its schedule.');
 const dueDay=Number(input.dueDay),firstDueDate=input.firstDueDate;if(!validDate(firstDueDate)||firstDueDate<=effectiveDate||!Number.isInteger(dueDay)||dueDay<1||dueDay>31)fail('Choose a future first due date and due day from 1–31.');
 const oldMonths=ledger.schedule.filter(s=>s.installment>0&&!s.retired&&s.balanceCents>0).length,dp=ledger.schedule.find(s=>s.installment===0),dpCreditCents=Math.min(creditCents,dp?.balanceCents||0),remainingDpCents=(dp?.balanceCents||0)-dpCreditCents,monthlyBalance=ledger.balanceCents-creditCents-remainingDpCents;
 let months,monthly;
 if(input.mode==='KEEP_MONTHLY'){monthly=account.contract.monthlyInstallmentCents||ledger.schedule.find(s=>s.installment>0&&s.balanceCents>0)?.amountCents;if(!monthly&&monthlyBalance)fail('An existing positive monthly installment is required.');months=monthlyBalance?Math.ceil(monthlyBalance/monthly):0;}
 else if(input.mode==='KEEP_TERM'||input.mode==='NEW_TERM'){months=monthlyBalance?(input.mode==='KEEP_TERM'?oldMonths:Number(input.months)):0;if(monthlyBalance&&!validTerm(months))fail('Choose a valid remaining or new installment term.');monthly=monthlyBalance?Math.ceil(monthlyBalance/months):0;}
 else fail('Choose an installment adjustment option.');
 if(months&&monthly*(months-1)>=monthlyBalance)fail('The balance is too small for this term. Choose fewer months.');
 const maxId=Math.max(0,...ledger.schedule.map(r=>r.installment)),newRows=[];const [y,m]=firstDueDate.split('-').map(Number),clamped=`${firstDueDate.slice(0,7)}-${String(Math.min(dueDay,new Date(Date.UTC(y,m,0)).getUTCDate())).padStart(2,'0')}`;if(firstDueDate!==clamped)fail('First due date must match the chosen due day, including month-end clamping.');
 for(let i=0;i<months;i++){const d=new Date(Date.UTC(y,m-1+i,1)),day=Math.min(dueDay,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate());newRows.push({installment:maxId+i+1,dueDate:d.toISOString().slice(0,7)+'-'+String(day).padStart(2,'0'),amountCents:i===months-1?monthlyBalance-monthly*(months-1):monthly});}
 if(remainingDpCents)newRows.unshift({installment:0,dueDate:firstDueDate,amountCents:remainingDpCents});
 if(newRows.reduce((n,r)=>n+r.amountCents,0)!==ledger.balanceCents-creditCents)fail('Amended schedule does not reconcile to the receiving balance.',409);
 const commissionReview=commissionWorkflowReview(account,ledger,{asOf:effectiveDate});
 return {commissionReview,beforeContract:account.contract,monitoringTerms:{...currentPenaltyPolicy(account),dueDay,effectiveDate},accountId:String(account._id),assignmentId:account.assignmentId,project:account.project,property:account.property,creditCents,dpCreditCents,mode:input.mode,months,monthlyCents:monthly||0,firstDueDate,dueDay,oldBalanceCents:ledger.balanceCents,newBalanceCents:ledger.balanceCents-creditCents,oldSchedule:ledger.schedule,newSchedule:newRows,beforeLedger:ledger,reason:note(input.reason,'Schedule amendment reason')};
}
export function distributeEntitlements(sources,targets,refundSchedule,disposition){
 const totalNetCents=sources.reduce((n,s)=>n+s.netCents,0),creditCents=targets.reduce((n,t)=>n+t.creditCents,0),refundCents=refundSchedule.reduce((n,r)=>n+r.amountCents,0);if(creditCents+refundCents>totalNetCents)fail('Credits and refunds together exceed the approved entitlement.');
 const unusedCents=totalNetCents-creditCents-refundCents;note(disposition,'Disposition of unused approved value',unusedCents>0);
 const allocations=sources.map(s=>({accountId:s.accountId,creditCents:0,refundCents:0,unusedCents:s.netCents}));let credit=creditCents,refund=refundCents;
 // A reviewed statutory cash minimum is reserved as a refund payable before any
 // noncash allocation. A credit cannot silently substitute for that cash floor.
 for(let i=0;i<sources.length;i++){const source=sources[i],row=allocations[i],minimum=source.legalReview.basis==='APPLIES'?source.legalReview.minimumCents:0;if(refund<minimum)fail('The refund plan does not fund the reviewed statutory cash minimum. Noncash credit cannot automatically replace it.');row.refundCents=minimum;row.unusedCents-=minimum;refund-=minimum;}
 for(const row of allocations){const part=Math.min(credit,row.unusedCents);row.creditCents=part;row.unusedCents-=part;credit-=part;}
 for(const row of allocations){const part=Math.min(refund,row.unusedCents);row.refundCents+=part;row.unusedCents-=part;refund-=part;}
 if(credit||refund)fail('Credit/refund source allocations do not reconcile.');
 for(const source of sources){const row=allocations.find(a=>a.accountId===source.accountId);if(row.creditCents+row.refundCents<source.legalReview.minimumCents)fail('The allocated credit/refund is below a source contract’s reviewed minimum entitlement.');}
 return {totalNetCents,creditCents,refundCents,unusedCents,disposition:String(disposition||''),sourceAllocations:allocations};
}
