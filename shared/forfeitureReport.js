const stamp=v=>v?new Date(v).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'';
const php=c=>(c||0)/100;
export function propertyHistoryReport(data){
 const sections=[{title:'Property Overview',headers:['Property ID','Phase','Block','Lot','Current Status','Reopening Status','As Of'],rows:[[data.property.propertyId,data.property.phaseNumber,data.property.blockNumber,data.property.lotNumber,data.property.status,data.property.reopeningStatus||'NONE',data.asOf]]},{title:'Property Timeline',headers:['Effective Date','Recorded Date / Time (PHT)','Action','Contract','User','Reason'],rows:data.events.map(e=>[e.effectiveDate||'',stamp(e.timestamp),e.action,e.contractId||'',e.username||'',e.reason||''])}];
 for(const a of data.contracts){
  sections.push({title:a.assignmentId+' Contract',headers:['Contract','Client ID','Client','Lifecycle','Price PHP','Agreed DP PHP','Term Months','First Due Date','Replacement Source'],rows:[[a.assignmentId,a.client?.clientId,[a.client?.firstName,a.client?.lastName].filter(Boolean).join(' '),a.lifecycle,php(a.contract.totalCents),php(a.contract.downPaymentCents),a.contract.months,a.contract.firstDueDate,a.reactivationIn?.sourceId||a.transferIn?.sourceId||'']]});
  sections.push({title:a.assignmentId+' Original Receipts',headers:['Payment ID','Receipt','Original Payment Date','Original Amount PHP','Type','Method','Corrections'],rows:(a.paymentHistory||[]).map(p=>[p.paymentId,p.receiptNumber||'',p.paymentDate,php(p.amountCents),p.type,p.method,p.revisions?.length||0])});
  for(const p of a.forfeiturePeriods){
   const key=a.assignmentId+' '+p.periodId.slice(0,8);
   sections.push({title:key+' Forfeiture',headers:['Effective Date','Approved Date (PHT)','End Date','Days Forfeited','Outcome','Reactivation Outcome','Frozen Principal PHP','Frozen Penalty PHP','Approved Credit PHP','Untransferred PHP','Penalty Resolution','Reason / Reference'],rows:[[p.effectiveDate,stamp(p.approvedAt),p.endedAt||'',p.duration.days,p.outcome||'PENDING',p.reactivationOutcome||'',php(p.beforeLedger.balanceCents),php(p.beforeLedger.outstandingPenaltyCents),php(p.creditDisposition?.creditCents),php(p.creditDisposition?.untransferredCents),p.reactivationPlan?.penaltyDecision||'FROZEN',[p.reason,p.documentReference].filter(Boolean).join(' · ')]]});
   sections.push({title:key+' Before Schedule',headers:['Period','Due Date','Scheduled PHP','Paid PHP','Balance PHP'],rows:p.beforeLedger.schedule.map(r=>[r.installment===0?'DP':r.installment,r.dueDate,php(r.amountCents),php(r.paidCents),php(r.balanceCents)])});
   if(p.reactivationPlan)sections.push({title:key+' Approved Schedule',headers:['Period','Due Date','Amount PHP'],rows:p.reactivationPlan.schedule.map(r=>[r.installment===0?'DP':r.installment,r.dueDate,php(r.amountCents)])});
   if(p.creditDisposition)sections.push({title:key+' Credit Sources',headers:['Payment ID','Source Installment','Effective Date','Applied Credit PHP'],rows:p.creditDisposition.allocations.map(r=>[r.paymentId,r.installmentId,r.effectiveDate,php(r.amountCents)])});
  }
 }
 return {title:'Permanent Property & Contract History',asOf:data.asOf,brand:data.brand,sections};
}
