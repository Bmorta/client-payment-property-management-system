import {penaltyPolicies} from '../../../shared/penaltyPolicy.js';

const urgency=['OVERDUE','DUE_TODAY','REQUIRES_REVIEW','DUE_SOON','UPDATED','ADVANCE_PAID','FULLY_PAID'];
const active=account=>!account.lifecycle||account.lifecycle==='ACTIVE';

export function cashierContractStatus(account, summary, asOf){
  if(!active(account)||summary?.settlement?.status==='NOT_APPLICABLE'&&!account.pendingCancellation||['CANCELLED','FORFEITED','TRANSFERRED','SUPERSEDED','ASSUMED'].includes(account.migration?.historicalStatus))return null;
  if(!summary||account.pendingCancellation||summary.settlement?.status==='REVIEW_REQUIRED')return {status:'REQUIRES_REVIEW'};
  if(summary.settlement?.status==='SETTLED')return {status:'FULLY_PAID'};
  const unpaid=summary.schedule.filter(row=>!row.retired&&row.balanceCents>0).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  const next=unpaid[0];
  if(!next)return {status:'REQUIRES_REVIEW'};
  const current=penaltyPolicies(account).filter(policy=>policy.effectiveDate<=asOf).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)).at(-1);
  const reminderDays=Number(current?.reminderDays||0);
  const dueNow=unpaid.filter(row=>row.dueDate<=asOf);
  const upcoming=unpaid.filter(row=>row.dueDate>asOf&&Date.parse(row.dueDate)-Date.parse(asOf)<=reminderDays*86400000);
  const covered=summary.schedule.some(row=>!row.retired&&row.installment>0&&row.amountCents>0&&row.balanceCents===0&&row.dueDate>asOf);
  const status=next.dueDate<asOf?'OVERDUE':next.dueDate===asOf?'DUE_TODAY':upcoming.length?'DUE_SOON':covered?'ADVANCE_PAID':'UPDATED';
  const due=dueNow.length?dueNow:upcoming;
  return {
    status,nextDueDate:next.dueDate,
    installments:due.filter(row=>row.installment>0).length,
    dueCents:due.reduce((total,row)=>total+row.balanceCents,0)
  };
}

export function cashierBuyerStatus(contracts){
  const applicable=contracts.filter(Boolean);
  const status=urgency.find(value=>applicable.some(contract=>contract.status===value));
  if(!status)return null;
  const dueStatuses=['OVERDUE','DUE_TODAY'].includes(status)?['OVERDUE','DUE_TODAY']:[status];
  const matching=applicable.filter(contract=>dueStatuses.includes(contract.status));
  return {
    status,contracts:applicable.length,affectedContracts:matching.length,
    installments:matching.reduce((total,contract)=>total+(contract.installments||0),0),
    dueCents:matching.reduce((total,contract)=>total+(contract.dueCents||0),0),
    nextDueDate:matching.map(contract=>contract.nextDueDate).filter(Boolean).sort()[0]
  };
}
