import {randomUUID} from "node:crypto";
const roundRatio=(a,b,c)=>Number((BigInt(a)*BigInt(b)+BigInt(Math.floor(c/2)))/BigInt(c));
export const percentAmount=(cents,bps)=>roundRatio(cents,bps,10000);
export function apportionBudgets(cents,agents){
 const entries=agents.map(a=>({agent:String(a.agent),floor:Number(BigInt(cents)*BigInt(a.percentageBps)/10000n),remainder:BigInt(cents)*BigInt(a.percentageBps)%10000n}));
 let extra=percentAmount(cents,agents.reduce((n,a)=>n+a.percentageBps,0))-entries.reduce((n,e)=>n+e.floor,0);
 entries.sort((a,b)=>a.remainder===b.remainder?a.agent.localeCompare(b.agent):a.remainder>b.remainder?-1:1);
 for(const entry of entries)if(extra>0){entry.floor++;extra--}
 return new Map(entries.map(e=>[e.agent,e.floor]));
}
export function splitCommission(total,term){let regular=Math.round(total/term);if(regular*(term-1)>total)regular=Math.floor(total/term);return Array.from({length:term},(_,i)=>i===term-1?total-regular*(term-1):regular)}
export const effectivePayout=p=>({...p,...(p.revisions?.at(-1)?.values||{}),payoutId:p.payoutId,status:p.revisions?.at(-1)?.values?.voided?"VOIDED":p.revisions?.length?"CORRECTED":"RELEASED",amountCents:p.revisions?.at(-1)?.values?.voided?0:(p.revisions?.at(-1)?.values?.amountCents??p.amountCents)});
export function calculateCommissions(account,ledger,{asOf="9999-12-31"}={}){
 const agreement=account.commissionAgreement,previous=account.commissionSnapshot?.records||[],records=[],payouts=(account.commissionPayouts||[]).map(effectivePayout).filter(p=>p.releaseDate<=asOf);
 if(agreement){
  const monthlyBasis=account.contract.totalCents-account.contract.downPaymentCents;
  const sources=Object.entries(ledger.allocations).filter(([paymentId])=>{const raw=(account.payments||[]).find(p=>p.paymentId===paymentId),last=raw?.revisions?.at(-1)?.values;return !(["CANCELLED","VOIDED"].includes(last?.status||raw?.status)||last?.voided||last?.cancelled||raw?.voided||raw?.cancelled)}).flatMap(([paymentId,rows])=>rows.filter(r=>["DOWN_PAYMENT","INSTALLMENT","ADVANCE"].includes(r.allocationType)).map(r=>({...r,paymentId}))).sort((a,b)=>a.installment-b.installment||a.effectiveDate.localeCompare(b.effectiveDate)||a.paymentId.localeCompare(b.paymentId));
  const dpSources=sources.filter(s=>s.installment===0),monthlySources=sources.filter(s=>s.installment>0);
  const agentBudgets=apportionBudgets(account.contract.totalCents,agreement.agents),dpBudgets=apportionBudgets(account.contract.downPaymentCents,agreement.agents);
  for(const allocation of agreement.agents){
   const agent=String(allocation.agent),budgetCents=agentBudgets.get(agent),dpBudget=Math.min(budgetCents,dpBudgets.get(agent)),monthlyBudget=budgetCents-dpBudget;
   const basisPeriods=splitCommission(monthlyBasis,agreement.termMonths),budgets=splitCommission(monthlyBudget,agreement.termMonths);
   const buckets=[{type:"DP",period:0,basisCents:account.contract.downPaymentCents,budgetCents:dpBudget,sources:dpSources.map(s=>({...s}))}];
   let sourceIndex=0,consumed=0;
   for(let i=0;i<agreement.termMonths;i++){
    const bucket={type:"MONTHLY",period:i+1,basisCents:basisPeriods[i],budgetCents:budgets[i],sources:[]};let capacity=bucket.basisCents;
    while(capacity>0&&sourceIndex<monthlySources.length){const source=monthlySources[sourceIndex],amount=Math.min(capacity,source.amountCents-consumed);if(amount>0){bucket.sources.push({...source,amountCents:amount});capacity-=amount;consumed+=amount}if(consumed===source.amountCents){sourceIndex++;consumed=0}}
    buckets.push(bucket);
   }
   for(const bucket of buckets){
    if(bucket.budgetCents===0)continue;
    const commissionId=`${account.assignmentId}-COM-${allocation.agentId||agent}-${bucket.type}${bucket.period}`,old=previous.find(r=>r.commissionId===commissionId);
    let collected=0,earned=0;
    const sourceAllocations=bucket.sources.map(source=>{collected+=source.amountCents;const cumulative=bucket.basisCents?(collected>=bucket.basisCents?bucket.budgetCents:Math.min(Math.max(0,bucket.budgetCents-1),roundRatio(bucket.budgetCents,collected,bucket.basisCents))):0;const commissionCents=cumulative-earned;earned=cumulative;return {...source,commissionCents}});
    records.push({commissionId,agent,agentId:allocation.agentId,type:bucket.type,period:bucket.period,percentageBps:allocation.percentageBps,budgetCents:bucket.budgetCents,basisCents:bucket.basisCents,collectedCents:collected,earnedCents:earned,sourceAllocations,earningDate:sourceAllocations.at(-1)?.effectiveDate||null,firstEarnedAt:old?.firstEarnedAt||(earned>0?sourceAllocations[0]?.effectiveDate:null),agreementVersion:agreement.version});
   }
  }
 }
 // Removed agents/periods with historical earnings or payouts stay traceable.
 for(const old of previous)if(!records.some(r=>r.commissionId===old.commissionId))records.push({...old,budgetCents:0,earnedCents:0,collectedCents:0,sourceAllocations:[],retired:true});
 for(const r of records){
  const released=payouts.filter(p=>p.commissionId===r.commissionId),old=previous.find(p=>p.commissionId===r.commissionId);
  r.releasedCents=released.reduce((n,p)=>n+p.amountCents,0);r.recoveredCents=(account.commissionRecoveries||[]).filter(p=>p.commissionId===r.commissionId&&(p.recoveryDate||"0000-00-00")<=asOf).reduce((n,p)=>n+p.amountCents,0);
  r.netReleasedCents=r.releasedCents-r.recoveredCents;r.unreleasedCents=Math.max(0,r.earnedCents-r.netReleasedCents);r.recoveryDueCents=Math.max(0,r.netReleasedCents-r.earnedCents);r.awaitingCents=Math.max(0,r.budgetCents-r.earnedCents);
  r.latestReleaseDate=released.filter(p=>p.amountCents>0).map(p=>p.releaseDate).sort().at(-1)||null;
  r.adjusted=Boolean(old?.adjusted||r.retired||(old&&old.earnedCents>r.earnedCents));
  r.status=r.recoveryDueCents>0||r.earnedCents===0&&r.adjusted?"ADJUSTED_REVERSED":r.earnedCents===0?"AWAITING_BUYER_PAYMENT":r.unreleasedCents===0?"RELEASED":r.netReleasedCents>0?"PARTIALLY_RELEASED":"UNRELEASED";
  r.earningStatus=r.earnedCents===0?(r.adjusted?"REVERSED":"AWAITING_BUYER_PAYMENT"):r.earnedCents<r.budgetCents?"PARTIALLY_EARNED":"EARNED";
  r.payoutStatus=r.recoveryDueCents>0?"RECOVERY_REQUIRED":r.earnedCents===0?"NOT_PAYABLE":r.unreleasedCents===0?"RELEASED":r.netReleasedCents>0?"PARTIALLY_RELEASED":"UNRELEASED";
  if(![r.budgetCents,r.earnedCents,r.releasedCents,r.recoveredCents,r.unreleasedCents,r.recoveryDueCents].every(Number.isSafeInteger))throw Object.assign(new Error("Commission totals exceed supported centavo precision."),{statusCode:409});
 }
 return {records};
}
export function commissionMutation(account,ledger,actor,reason){
 const snapshot=calculateCommissions(account,ledger),old=account.commissionSnapshot?.records||[],events=[],notifications=[];
 for(const record of snapshot.records){
  const previous=old.find(r=>r.commissionId===record.commissionId),signature=value=>JSON.stringify(value?{budgetCents:value.budgetCents,earnedCents:value.earnedCents,releasedCents:value.releasedCents,recoveredCents:value.recoveredCents,sourceAllocations:value.sourceAllocations,status:value.status}:null);
  if(signature(previous)===signature(record))continue;
  const eventId=randomUUID(),event={eventId,commissionId:record.commissionId,agent:record.agent,action:!previous?"COMMISSION_CREATED":record.earnedCents!==previous.earnedCents?"COMMISSION_EARNINGS_ADJUSTED":record.recoveredCents!==previous.recoveredCents?"COMMISSION_RECOVERY_RECORDED":record.releasedCents>previous.releasedCents?"COMMISSION_RELEASE_RECORDED":record.releasedCents<previous.releasedCents?"COMMISSION_PAYOUT_ADJUSTED":record.budgetCents!==previous.budgetCents?"COMMISSION_ALLOCATION_ADJUSTED":"COMMISSION_SOURCES_ADJUSTED",previousValues:previous||null,updatedValues:record,...actor,reason,timestamp:new Date()};events.push(event);
  const increased=record.earnedCents>(previous?.earnedCents||0),adjusted=previous&&record.earnedCents<previous.earnedCents;
  if(increased||adjusted)notifications.push({id:`commission:${eventId}`,recipient:"ADMIN",commissionAlert:true,eventOnly:true,status:record.recoveryDueCents?"COMMISSION_RECOVERY_REQUIRED":adjusted?"COMMISSION_ADJUSTED":"COMMISSION_READY_FOR_RELEASE",message:`${account.assignmentId}: ${record.agentId} — ${record.recoveryDueCents?"commission recovery required":adjusted?"commission adjusted":"earned commission ready for release"}`,href:`/commissions?account=${account._id}&agent=${record.agent}`,createdAt:new Date(),readBy:[]});
 }
 return {snapshot,events,notifications,changed:JSON.stringify(snapshot)!==JSON.stringify(account.commissionSnapshot||{records:[]})};
}
