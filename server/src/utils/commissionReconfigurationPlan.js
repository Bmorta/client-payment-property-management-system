import {apportionBudgets,splitCommission} from '../../../shared/commissionMath.js';
const fail=message=>{throw Object.assign(new Error(message),{statusCode:409})};
const cents=(v,label)=>{if(!Number.isSafeInteger(v)||v<0)fail(`Invalid ${label}.`);return v};
// Read-only planning: caller must load authoritative source records, validate
// lineage/permissions and revalidate the resulting preview before any write.
export function commissionReconfigurationPlan({option,agreement,records,revisedBasisCents,agents=agreement?.agents,authorizedPercentageBps=agreement?.percentageBps,termMonths}){
 if(!['RETAIN','RECALCULATE','CONTINUE'].includes(option)||!agreement||!Array.isArray(records))fail('Choose an existing agreement and a supported commission option.');
 if(!Number.isSafeInteger(agreement.termMonths)||agreement.termMonths<1||agreement.termMonths>1200)fail('Original commission term requires review.');
 const allocations=option==='RETAIN'?agreement.agents:agents;
 if(!allocations?.length||new Set(allocations.map(a=>String(a.agent))).size!==allocations.length)fail('Choose unique assigned agents.');
 if(!Number.isSafeInteger(authorizedPercentageBps)||authorizedPercentageBps<1||authorizedPercentageBps>10000||allocations.some(a=>!Number.isSafeInteger(a.percentageBps)||a.percentageBps<1||a.percentageBps>10000)||allocations.reduce((n,a)=>n+a.percentageBps,0)>authorizedPercentageBps)fail('Agent allocations exceed the authorized commission percentage.');
 const originalIds=new Set(agreement.agents.map(a=>String(a.agent)));
 if(allocations.some(a=>!originalIds.has(String(a.agent)))||agreement.agents.some(a=>!allocations.some(b=>String(a.agent)===String(b.agent))))fail('Agent changes require a separate reviewed allocation amendment.');
 if(new Set(records.map(r=>r.commissionId)).size!==records.length)fail('Duplicate source commission identities require reconciliation.');
 const revised=option==='RETAIN'?null:apportionBudgets(cents(revisedBasisCents,'revised basis'),allocations);
 const rows=allocations.map(a=>{
  const original=agreement.agents.find(o=>String(o.agent)===String(a.agent)),history=records.filter(r=>String(r.agent)===String(a.agent));
  const sum=k=>{const total=history.reduce((n,r)=>n+cents(r[k]??0,k),0);return cents(total,k)};
  const earnedCents=sum('earnedCents'),releasedCents=sum('releasedCents'),recoveredCents=sum('recoveredCents');
  const agentTerm=agreement.agentTerms?.[a.agent]??agreement.termMonths;
  const monthly=history.filter(r=>r.type==='MONTHLY'&&!r.retired&&r.budgetCents>0).sort((a,b)=>a.period-b.period);
  if(new Set(monthly.map(r=>r.period)).size!==monthly.length||monthly.some(r=>!Number.isSafeInteger(r.period)||r.period<1||r.period>agentTerm))fail('Original commission periods require review.');
  const completed=monthly.filter(r=>r.earnedCents>=r.budgetCents),remaining=monthly.filter(r=>r.earnedCents<r.budgetCents);
  const originalEntitlementCents=sum('budgetCents'),entitlementCents=option==='RETAIN'?originalEntitlementCents:revised.get(String(a.agent));
  const futureCents=Math.max(0,entitlementCents-earnedCents),excessEarnedCents=Math.max(0,earnedCents-entitlementCents),issues=[];
  if(excessEarnedCents)issues.push('Previously earned commission exceeds revised entitlement; administrator review required. No automatic reversal.');
  if(history.some(r=>r.recoveryDueCents>0||r.historicalVerificationCents>0))issues.push('Existing recovery or historical verification restrictions remain unresolved.');
  const count=option==='RECALCULATE'?Number(termMonths):remaining.length;
  if(!Number.isSafeInteger(count)||count<0||count>1200)fail('Choose a valid future commission term.');
  if(!count&&futureCents)issues.push('No remaining commission installments; administrator review required.');
  const futureSchedule=option==='RETAIN'?history.filter(r=>!r.retired&&r.budgetCents>r.earnedCents).map(r=>({originalCommissionId:r.commissionId,type:r.type,period:r.period,amountCents:r.budgetCents-r.earnedCents,basisCents:r.basisCents,collectedCents:r.collectedCents,originalBudgetCents:r.budgetCents,preservedEarnedCents:r.earnedCents,lineagePeriodId:r.lineagePeriodId,inheritedSourceAllocations:r.inheritedSourceAllocations||r.sourceAllocations||[]})):count?splitCommission(futureCents,count).map((amountCents,i)=>({type:'MONTHLY',period:option==='CONTINUE'?remaining[i].period:i+1,lineagePeriodId:option==='CONTINUE'?remaining[i].lineagePeriodId:undefined,amountCents})):[];
  return {agent:String(a.agent),agentId:original.agentId,originalPercentageBps:original.percentageBps,percentageBps:a.percentageBps,originalTermMonths:agentTerm,completedInstallments:completed.length+(agreement.completedOffsets?.[a.agent]||0),remainingInstallments:remaining.length,earnedCents,releasedCents,recoveredCents,unreleasedCents:Math.max(0,earnedCents-(releasedCents-recoveredCents)),originalEntitlementCents,entitlementCents,futureCents,excessEarnedCents,futureSchedule,issues,requiresReview:issues.length>0};
 });
 return {option,agents:rows,requiresReview:rows.some(r=>r.requiresReview),policy:'Revised entitlement includes preserved earnings. Actual payouts remain separate. Noncash credits create no new earnings.'};
}
