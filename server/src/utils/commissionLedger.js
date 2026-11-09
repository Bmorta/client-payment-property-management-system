import {historicalFingerprint,historicalReviewMatches} from './commissionReconciliation.js';
import {randomUUID} from "node:crypto";
import {roundRatio,percentAmount,apportionBudgets,splitCommission} from "../../../shared/commissionMath.js";
export {percentAmount,apportionBudgets,splitCommission} from "../../../shared/commissionMath.js";
export const effectivePayout=p=>({...p,...(p.revisions?.at(-1)?.values||{}),payoutId:p.payoutId,status:p.revisions?.at(-1)?.values?.voided?"VOIDED":p.revisions?.length?"CORRECTED":"RELEASED",amountCents:p.revisions?.at(-1)?.values?.voided?0:(p.revisions?.at(-1)?.values?.amountCents??p.amountCents)});
export function calculateCommissions(account,ledger,{asOf="9999-12-31"}={}){
 const agreement=account.commissionAgreement,previous=account.commissionSnapshot?.records||[],records=[],payouts=(account.commissionPayouts||[]).map(effectivePayout).filter(p=>p.releaseDate<=asOf);
 if(agreement){
  const monthlyBasis=account.contract.totalCents-account.contract.downPaymentCents;
  let sources=Object.entries(ledger.allocations).filter(([paymentId])=>{const raw=(account.payments||[]).find(p=>p.paymentId===paymentId),last=raw?.revisions?.at(-1)?.values;return (raw?.origin!=="HISTORICAL"||!!account.migration?.activatedAt)&&!(["CANCELLED","VOIDED","REVERSED"].includes(last?.status||raw?.status)||last?.voided||last?.cancelled||raw?.voided||raw?.cancelled)}).flatMap(([paymentId,rows])=>rows.filter(r=>["DOWN_PAYMENT","INSTALLMENT","ADVANCE"].includes(r.allocationType)).map(r=>({...r,paymentId,historical:(account.payments||[]).find(p=>p.paymentId===paymentId)?.origin==='HISTORICAL'}))).sort((a,b)=>a.installment-b.installment||a.effectiveDate.localeCompare(b.effectiveDate)||a.paymentId.localeCompare(b.paymentId));
  if(account.creditAmendments?.length){
   // Preserve all original period identities (including explicit out-of-order
   // payments). Only post-amendment cash fills the remaining original basis.
   const basis=account.contract.schedule.filter(s=>s.installment>0),originalIds=new Set(account.creditAmendments[0].beforeLedger.payments.map(p=>p.paymentId)),preserved=sources.filter(s=>originalIds.has(s.paymentId)),funded=new Map();
   for(const source of preserved.filter(s=>s.installment>0))funded.set(source.installment,(funded.get(source.installment)||0)+source.amountCents);
   const monthly=sources.filter(s=>s.installment>0&&!originalIds.has(s.paymentId)).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.paymentId.localeCompare(b.paymentId)),normalized=[];let index=0;
   for(const source of monthly){let remaining=source.amountCents;while(remaining&&index<basis.length){const row=basis[index],available=Math.max(0,row.amountCents-(funded.get(row.installment)||0));if(!available){index++;continue}const part=Math.min(remaining,available);normalized.push({...source,actualInstallmentId:source.installmentId,actualInstallment:source.installment,installment:row.installment,installmentId:'I'+row.installment,dueDate:row.dueDate,amountCents:part});remaining-=part;funded.set(row.installment,(funded.get(row.installment)||0)+part);}}
   sources=[...preserved,...sources.filter(s=>s.installment===0&&!originalIds.has(s.paymentId)),...normalized];
  }
  const paidByPeriod=new Map();for(const source of sources.filter(s=>s.installment>0))paidByPeriod.set(source.installment,(paidByPeriod.get(source.installment)||0)+source.amountCents);
  const buyerPeriods=account.contract.schedule.filter(s=>s.installment>0),completed=new Set(buyerPeriods.filter(s=>(paidByPeriod.get(s.installment)||0)>=s.amountCents&&s.amountCents>0).map(s=>s.installment));
  const dpSources=sources.filter(s=>s.installment===0),allMonthlySources=sources.filter(s=>s.installment>0),monthlySources=allMonthlySources.filter(s=>completed.has(s.installment));
  const agentBudgets=apportionBudgets(account.contract.totalCents,agreement.agents),dpBudgets=apportionBudgets(account.contract.downPaymentCents,agreement.agents);
  for(const allocation of agreement.agents){
   const agent=String(allocation.agent),budgetCents=agentBudgets.get(agent),dpBudget=Math.min(budgetCents,dpBudgets.get(agent)),monthlyBudget=budgetCents-dpBudget;
   const sameTerm=buyerPeriods.length===agreement.termMonths;
   const basisPeriods=sameTerm?buyerPeriods.map(s=>s.amountCents):splitCommission(monthlyBasis,agreement.termMonths),budgets=splitCommission(monthlyBudget,agreement.termMonths);
   const buckets=[{type:"DP",period:0,basisCents:account.contract.downPaymentCents,budgetCents:dpBudget,sources:dpSources.map(s=>({...s}))}];
   let sourceIndex=0,consumed=0;
   for(let i=0;i<agreement.termMonths;i++){
    const bucket={type:"MONTHLY",period:i+1,basisCents:basisPeriods[i],budgetCents:budgets[i],sources:[]};let capacity=bucket.basisCents;
    if(sameTerm){bucket.sources=allMonthlySources.filter(s=>s.installment===buyerPeriods[i].installment).map(s=>({...s}));capacity=0}
    while(capacity>0&&sourceIndex<monthlySources.length){const source=monthlySources[sourceIndex],amount=Math.min(capacity,source.amountCents-consumed);if(amount>0){bucket.sources.push({...source,amountCents:amount});capacity-=amount;consumed+=amount}if(consumed===source.amountCents){sourceIndex++;consumed=0}}
    buckets.push(bucket);
   }
   for(const bucket of buckets){
    if(bucket.budgetCents===0)continue;
    const commissionId=`${account.assignmentId}-COM-${allocation.agentId||agent}-${bucket.type}${bucket.period}`,old=previous.find(r=>r.commissionId===commissionId);
    let collected=0,earned=0;
    const sourceAllocations=bucket.sources.filter(source=>!agreement.effectiveDate||source.effectiveDate>=agreement.effectiveDate).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.paymentId.localeCompare(b.paymentId)||a.installment-b.installment).map(source=>{collected+=source.amountCents;const cumulative=bucket.basisCents?(collected>=bucket.basisCents?bucket.budgetCents:bucket.type==="MONTHLY"?0:Math.min(Math.max(0,bucket.budgetCents-1),roundRatio(bucket.budgetCents,collected,bucket.basisCents))):0;const commissionCents=cumulative-earned;earned=cumulative;return {...source,commissionCents}});
    records.push({commissionId,agent,agentId:allocation.agentId,type:bucket.type,period:bucket.period,percentageBps:allocation.percentageBps,budgetCents:bucket.budgetCents,basisCents:bucket.basisCents,collectedCents:collected,earnedCents:earned,sourceAllocations,earningDate:earned>0?sourceAllocations.at(-1)?.effectiveDate||null:null,firstEarnedAt:(earned>0?sourceAllocations.find(s=>s.commissionCents>0)?.effectiveDate:null),earningRule:"FULL_INSTALLMENT_PERIODS",agreementVersion:agreement.version,agreementEffectiveDate:agreement.effectiveDate||account.contract.contractDate||null});
   }
  }
 }
 // Removed agents/periods with historical earnings or payouts stay traceable.
 for(const old of previous)if(!records.some(r=>r.commissionId===old.commissionId)&&!(agreement?.prunedCommissionIds||[]).includes(old.commissionId))records.push({...old,budgetCents:0,earnedCents:0,collectedCents:0,sourceAllocations:[],retired:true});
 for(const r of records){
  const released=payouts.filter(p=>p.commissionId===r.commissionId),old=previous.find(p=>p.commissionId===r.commissionId);
  r.releasedCents=released.reduce((n,p)=>n+p.amountCents,0);r.recoveredCents=(account.commissionRecoveries||[]).filter(p=>p.commissionId===r.commissionId&&(p.recoveryDate||"0000-00-00")<=asOf).reduce((n,p)=>n+p.amountCents,0);
  r.netReleasedCents=r.releasedCents-r.recoveredCents;r.unreleasedCents=Math.max(0,r.earnedCents-r.netReleasedCents);r.recoveryDueCents=Math.max(0,r.netReleasedCents-r.earnedCents);r.awaitingCents=['TRANSFERRED','CANCELLED'].includes(account.lifecycle)?0:Math.max(0,r.budgetCents-r.earnedCents);if(['TRANSFERRED','CANCELLED'].includes(account.lifecycle))r.earningClosed=true;
  r.historicalPayoutEvidence=released.filter(p=>p.origin==='HISTORICAL').map(p=>[p.payoutId,p.amountCents,p.releaseDate,p.method,p.reference||'']).sort((a,b)=>a[0].localeCompare(b[0]));
  r.historicalVerificationRequired=r.earnedCents>0&&r.sourceAllocations.some(s=>s.historical)&&!(account.commissionHistoricalReviews||[]).some(review=>historicalReviewMatches(review,r,agreement));
  r.historicalVerificationCents=r.historicalVerificationRequired?r.unreleasedCents:0;r.releasableCents=r.unreleasedCents-r.historicalVerificationCents;
  r.historicalFingerprint=historicalFingerprint(r,agreement);
  r.latestReleaseDate=released.filter(p=>p.amountCents>0).map(p=>p.releaseDate).sort().at(-1)||null;
  r.adjusted=Boolean(old?.adjusted||r.retired||(old&&old.earnedCents>r.earnedCents));
  r.status=r.recoveryDueCents>0||r.earnedCents===0&&r.adjusted?"ADJUSTED_REVERSED":r.earnedCents===0?"AWAITING_BUYER_PAYMENT":r.unreleasedCents===0?"RELEASED":r.netReleasedCents>0?"PARTIALLY_RELEASED":"UNRELEASED";
  r.earningStatus=r.earnedCents===0?(r.adjusted?"REVERSED":"AWAITING_BUYER_PAYMENT"):r.earnedCents<r.budgetCents?"PARTIALLY_EARNED":"EARNED";
  r.payoutStatus=r.historicalVerificationCents>0?"HISTORICAL_VERIFICATION_REQUIRED":r.recoveryDueCents>0?"RECOVERY_REQUIRED":r.earnedCents===0?"NOT_PAYABLE":r.unreleasedCents===0?"RELEASED":r.netReleasedCents>0?"PARTIALLY_RELEASED":"UNRELEASED";
  if(![r.budgetCents,r.earnedCents,r.releasedCents,r.recoveredCents,r.unreleasedCents,r.recoveryDueCents].every(Number.isSafeInteger))throw Object.assign(new Error("Commission totals exceed supported centavo precision."),{statusCode:409});
 }
 if(new Set(records.map(r=>r.commissionId)).size!==records.length)throw Object.assign(new Error('Duplicate commission period keys. Administrator reconciliation required.'),{statusCode:409});
 return {records};
}
export function commissionMutation(account,ledger,actor,reason){
 const snapshot=calculateCommissions(account,ledger),old=account.commissionSnapshot?.records||[],events=[],notifications=[];
 for(const record of snapshot.records){
  const previous=old.find(r=>r.commissionId===record.commissionId),signature=value=>JSON.stringify(value?{budgetCents:value.budgetCents,earnedCents:value.earnedCents,releasedCents:value.releasedCents,recoveredCents:value.recoveredCents,sourceAllocations:value.sourceAllocations,status:value.status,historicalVerificationCents:value.historicalVerificationCents,releasableCents:value.releasableCents,agreementEffectiveDate:value.agreementEffectiveDate,agreementVersion:value.agreementVersion}:null);
  if(signature(previous)===signature(record))continue;
  const eventId=randomUUID(),event={eventId,commissionId:record.commissionId,agent:record.agent,action:!previous?"COMMISSION_CREATED":record.earnedCents!==previous.earnedCents?"COMMISSION_EARNINGS_ADJUSTED":record.recoveredCents!==previous.recoveredCents?"COMMISSION_RECOVERY_RECORDED":record.releasedCents>previous.releasedCents?"COMMISSION_RELEASE_RECORDED":record.releasedCents<previous.releasedCents?"COMMISSION_PAYOUT_ADJUSTED":record.budgetCents!==previous.budgetCents?"COMMISSION_ALLOCATION_ADJUSTED":"COMMISSION_SOURCES_ADJUSTED",previousValues:previous||null,updatedValues:record,...actor,reason,timestamp:new Date()};events.push(event);
  const increased=record.earnedCents>(previous?.earnedCents||0),adjusted=previous&&record.earnedCents<previous.earnedCents;
  const unlocked=record.releasableCents>(previous?.releasableCents??previous?.unreleasedCents??0),held=record.historicalVerificationCents>(previous?.historicalVerificationCents||0);
  if(increased||adjusted||unlocked||held)notifications.push({id:`commission:${eventId}`,recipient:"ADMIN",commissionAlert:true,eventOnly:true,status:record.historicalVerificationCents>0?"COMMISSION_HISTORICAL_REVIEW_REQUIRED":record.recoveryDueCents?"COMMISSION_RECOVERY_REQUIRED":adjusted?"COMMISSION_ADJUSTED":"COMMISSION_READY_FOR_RELEASE",message:`${account.assignmentId}: ${record.agentId} — ${record.historicalVerificationCents>0?"historical commission verification required":record.recoveryDueCents?"commission recovery required":adjusted?"commission adjusted":"earned commission ready for release"}`,href:`/commissions?account=${account._id}&agent=${record.agent}`,createdAt:new Date(),readBy:[]});
 }
 return {snapshot,events,notifications,changed:JSON.stringify(snapshot)!==JSON.stringify(account.commissionSnapshot||{records:[]})};
}
