import {COMPLETED_BUYER_INSTALLMENTS} from '../../../shared/commissionMath.js';
import {calculateCommissions} from './commissionLedger.js';
import {allocatePayments} from './paymentLedger.js';
import {digest} from './commissionReconciliation.js';
const totals=snapshot=>Object.fromEntries(['earnedCents','releasedCents','unreleasedCents','releasableCents','historicalVerificationCents','recoveryDueCents'].map(key=>[key,snapshot.records.reduce((n,r)=>n+(r[key]||0),0)]));
// A read-only proposal. Existing agreements keep their saved rule until an
// administrator confirms this exact version and before/after preview.
export function commissionReconciliationPlan(account){
 const agreement=account.commissionAgreement,ledger=allocatePayments(account),periods=account.contract.schedule.filter(s=>s.installment>0).length;
 const ruleChange=!!agreement&&agreement.monthlyEarningRule!==COMPLETED_BUYER_INSTALLMENTS&&agreement.termMonths<periods;
 const issues=[];
 if(ruleChange&&(['TRANSFERRED','CANCELLED'].includes(account.lifecycle)||account.pendingCancellation||account.transferIn||account.creditAmendments?.length))issues.push('Closed, transferred or credit-amended contracts require a separate reviewed commission amendment.');
 const proposed=ruleChange?{...account,commissionAgreement:{...agreement,monthlyEarningRule:COMPLETED_BUYER_INSTALLMENTS,version:(agreement.version||0)+1}}:account;
 const snapshot=calculateCommissions(proposed,ledger),before=totals(account.commissionSnapshot||calculateCommissions(account,ledger)),after=totals(snapshot);
 const token=digest({version:account.__v,agreement:proposed.commissionAgreement,snapshot});
 return {proposed,snapshot,ruleChange,canApply:issues.length===0,issues,before,after,token,needsReconciliation:ruleChange||JSON.stringify(snapshot)!==JSON.stringify(account.commissionSnapshot)};
}
