import {calendarDay} from "./contractMonitoring.js";
import {summarizeAccount} from "./accounting.js";
export function monitoringReports(accounts,from,to,asOf){
 const result={upcoming:[],overdue:[],advance:[],fullyPaid:[],penalties:[],critical:[],forfeiture:[]};
 for(const a of accounts){const s=summarizeAccount(a,asOf),base={accountId:a._id,assignmentId:a.assignmentId,client:a.client,project:a.project,property:a.property,asOf,riskStatus:s.riskStatus,consecutiveUnpaidMonths:s.consecutiveUnpaidMonths,nextUnpaidDueDate:s.nextUnpaidDueDate,outstandingPrincipalCents:s.balanceCents,outstandingPenaltyCents:s.outstandingPenaltyCents};
  for(const row of s.schedule){const entry={...base,...row};if(!["FORFEITED","SUPERSEDED"].includes(s.category)&&row.balanceCents>0&&row.dueDate>=from&&row.dueDate<=to&&!row.overdue)result.upcoming.push(entry);if(row.overdue)result.overdue.push(entry);if(row.installment>0&&row.balanceCents===0&&row.dueDate>=from&&row.dueDate<=to)result.fullyPaid.push(entry)}
  for(const [paymentId,rows]of Object.entries(s.allocations))for(const row of rows)if(row.allocationType==="ADVANCE"&&row.effectiveDate>=from&&row.effectiveDate<=to)result.advance.push({...base,...row,paymentId});
  for(const row of s.assessments)if(row.cycleDate>=from&&row.cycleDate<=to)result.penalties.push({...base,...row});
  const review=a.forfeitureReviews?.filter(r=>calendarDay(r.timestamp)<=asOf).at(-1);
  if(s.riskStatus==="CRITICAL")result.critical.push(base);if(s.riskStatus==="FORFEITURE_REVIEW_REQUIRED"||review)result.forfeiture.push({...base,reviewStatus:review?.status||"FORFEITURE_REVIEW_REQUIRED"});
 }
 return result;
}
export const reportColumns=["Account","Client ID","Client","Project","Lot","Due / Cycle Date","Installment","Status","Amount PHP","Outstanding Principal PHP","Outstanding Penalties PHP"];
export function reportRow(row){return [row.assignmentId,row.client?.clientId,[row.client?.firstName,row.client?.lastName].filter(Boolean).join(" "),row.project?.projectName,`Phase ${row.property?.phaseNumber} / Block ${row.property?.blockNumber} / Lot ${row.property?.lotNumber}`,row.cycleDate||row.dueDate||row.nextUnpaidDueDate,row.installment,row.reviewStatus||row.status||row.riskStatus,((row.amountCents||0)/100).toFixed(2),((row.outstandingPrincipalCents||0)/100).toFixed(2),((row.outstandingPenaltyCents||0)/100).toFixed(2)]}
