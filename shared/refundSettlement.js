const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
export function refundComputation(principalCents,penaltyCents,input){
 const parse=v=>{if(!/^\d+(?:\.\d{1,2})?$/.test(String(v??'')))fail('Enter a nonnegative amount with at most two decimals.');const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n))fail('Amount is too large.');return n};
 let bps=input.option==='THIRTY'?3000:input.option==='FULL'?10000:input.option==='PERCENT'?parse(input.refundPercentage):null;
 if(!['THIRTY','FULL','CUSTOM','PERCENT'].includes(input.option)||bps!==null&&(bps<0||bps>10000))fail('Choose a refund percentage from 0 to 100 or a custom amount.');
 const custom=input.option==='CUSTOM'||input.option==='FULL'&&input.customAmount!==undefined&&input.customAmount!=='';
 const grossCents=custom?parse(input.customAmount):Number((BigInt(principalCents)*BigInt(bps)+5000n)/10000n);
 if(grossCents>principalCents)fail('Cancellation value exceeds eligible actual principal and down-payment allocations.');
 if(!['DEDUCT','WAIVE','SETTLED','NO_DEDUCTION','CUSTOM'].includes(input.penaltyDecision))fail('Choose a valid penalty decision.');
 if(input.penaltyDecision==='SETTLED'&&penaltyCents)fail('Settle penalties through Payments before this decision.');
 const penaltyDeductionCents=input.penaltyDecision==='DEDUCT'?penaltyCents:input.penaltyDecision==='CUSTOM'?parse(input.customPenaltyDeduction):0;
 if(penaltyDeductionCents>penaltyCents||penaltyDeductionCents>grossCents)fail('Penalty deduction exceeds the actual penalty or proposed refund.');
 return {percentage:bps===null?null:bps/100,approvedPercentageBps:custom?(principalCents?Number((BigInt(grossCents)*10000n+BigInt(Math.floor(principalCents/2)))/BigInt(principalCents)):0):bps,percentageIsEquivalent:custom,grossCents,penaltyDeductionCents,netCents:grossCents-penaltyDeductionCents};
}
export function refundPlan({amountCents,months,firstDate,method='CASH',customMonthlyCents=null}){
 if(!Number.isSafeInteger(amountCents)||amountCents<=0||!Number.isInteger(months)||months<1||months>1200||!/^\d{4}-\d{2}-\d{2}$/.test(firstDate||'')||!Number.isFinite(Date.parse(firstDate))||new Date(firstDate).toISOString().slice(0,10)!==firstDate)fail('Choose a positive refund, valid first date and a term of 1–1200 months.');
 const base=customMonthlyCents??Math.floor(amountCents/months);if(!Number.isSafeInteger(base)||base<=0||base*(months-1)>=amountCents)fail('Custom monthly amount must leave a positive final installment. Choose a shorter term or smaller amount.');
 const [year,month,day]=firstDate.split('-').map(Number);return Array.from({length:months},(_,i)=>{const d=new Date(Date.UTC(year,month-1+i,1)),last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();return {installment:i+1,date:`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`,amountCents:i===months-1?amountCents-base*(months-1):base,method}});
}
export function penaltyBreakdown(ledger){const rows=new Map(),seen=new Set();for(const p of ledger.assessments||[]){if(!p.balanceCents||p.assessmentId&&seen.has(p.assessmentId))continue;if(p.assessmentId)seen.add(p.assessmentId);const month=(p.cycleDate||p.dueDate||'Unspecified').slice(0,7);rows.set(month,(rows.get(month)||0)+p.balanceCents)}return [...rows].sort().map(([month,amountCents])=>({month,amountCents}))}
export function refundInstallmentAllocations(schedule,alreadyPaidCents,releaseCents){
 let skip=alreadyPaidCents,remaining=releaseCents;const rows=[];for(const [index,r]of schedule.entries()){const available=Math.max(0,r.amountCents-skip);skip=Math.max(0,skip-r.amountCents);const amountCents=Math.min(remaining,available);if(amountCents){rows.push({installment:r.installment||index+1,plannedDate:r.date,amountCents});remaining-=amountCents}}if(remaining)fail('Refund installment allocations do not reconcile with the approved plan.');return rows;
}
