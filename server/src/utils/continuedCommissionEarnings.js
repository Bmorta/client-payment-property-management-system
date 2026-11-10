import {roundRatio} from '../../../shared/commissionMath.js';
// Generates prospective periods only. The ordinary ledger finalizer still owns
// payout, recovery, verification and release-hold calculations.
export function continuedCommissionEarnings(account,ledger,{asOf='9999-12-31'}={}){
 const c=account.commissionContinuation;
 if(account.commissionContinuationOut)return account.commissionContinuationOut?.records?.map(r=>({...r,originalBudgetCents:r.originalBudgetCents??r.budgetCents,budgetCents:r.earnedCents,sourceAllocations:(r.sourceAllocations||[]).map(s=>({...s}))}))||[];
 if(!c)return [];
 const preserved=c.preservedRecords.map(r=>({...r,originalBudgetCents:r.originalBudgetCents??r.budgetCents,budgetCents:r.earnedCents,sourceAllocations:(r.sourceAllocations||[]).map(s=>({...s}))}));
 const excluded=new Set(c.excludedPaymentIds),sources=Object.entries(ledger.allocations).flatMap(([paymentId,rows])=>{
  const p=ledger.payments?.find(p=>p.paymentId===paymentId)||(account.payments||[]).find(p=>p.paymentId===paymentId);
  if(!p||p.origin==='HISTORICAL'||excluded.has(paymentId))return [];
  return rows.filter(r=>['DOWN_PAYMENT','INSTALLMENT','ADVANCE'].includes(r.allocationType)&&r.effectiveDate>=c.effectiveDate&&r.effectiveDate<=asOf).map(r=>({...r,paymentId,historical:false}));
 }).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.paymentId.localeCompare(b.paymentId)||a.installment-b.installment);
 const result=[...preserved];
 for(const plan of c.plans){const cursors={DP:{index:0,used:0},MONTHLY:{index:0,used:0}};
  for(const [i,period] of plan.futureSchedule.entries()){
   let needed=period.requiredCashCents,collected=0;const allocations=[],cursor=cursors[period.type],pool=sources.filter(s=>period.type==='DP'?s.allocationType==='DOWN_PAYMENT':s.allocationType!=='DOWN_PAYMENT');let sourceIndex=cursor.index,used=cursor.used;
   while(needed>0&&sourceIndex<pool.length){const s=pool[sourceIndex],part=Math.min(needed,s.amountCents-used);if(part>0){allocations.push({...s,amountCents:part,commissionCents:0});needed-=part;used+=part;collected+=part}if(used===s.amountCents){sourceIndex++;used=0}}
   cursor.index=sourceIndex;cursor.used=used;
   const earned=needed===0?period.amountCents:period.type==='DP'&&period.basisCents?Math.max(0,Math.min(period.amountCents-1,roundRatio(period.originalBudgetCents,(period.collectedCents||0)+collected,period.basisCents)-(period.preservedEarnedCents||0))):0;
   if(earned&&allocations.length)allocations.at(-1).commissionCents=earned;
   result.push({commissionId:`${account.assignmentId}-RC-${c.id}-${plan.agentId}-${i+1}`,agent:plan.agent,agentId:plan.agentId,type:period.type,period:period.period,percentageBps:plan.percentageBps,budgetCents:period.amountCents,basisCents:period.requiredCashCents,collectedCents:collected,earnedCents:earned,sourceAllocations:allocations,earningDate:earned?allocations.at(-1)?.effectiveDate:null,firstEarnedAt:earned?allocations.at(-1)?.effectiveDate:null,earningRule:'CONTINUED_FULL_PERIOD',agreementVersion:account.commissionAgreement.version,agreementEffectiveDate:c.effectiveDate,continuationId:c.id,originalContractId:c.sourceContract,lineagePeriodId:period.lineagePeriodId||`${c.id}:${plan.agent}:${period.type}:${period.period}`,agreementId:c.currentAgreementId||account.commissionAgreement.agreementId,inheritedSourceAllocations:period.inheritedSourceAllocations||[]});
  }
 }
 return result;
}
