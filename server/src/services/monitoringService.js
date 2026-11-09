import {commissionMutation} from "../utils/commissionLedger.js";
import {randomUUID} from "node:crypto";
import PropertyAssignment from "../models/PropertyAssignment.js";
import {summarizeAccount,today} from "../utils/accounting.js";
import {addDays} from "../utils/contractMonitoring.js";
export function monitoringMutation(account,actor={username:"system",role:"SYSTEM"},reason="Scheduled monitoring",asOf=today()){
 const summary=summarizeAccount(account,asOf),stamp=new Date(),snapshot={asOf,penaltyCalculationRule:summary.penaltyCalculationRule,currentPenaltySummary:summary.currentPenaltySummary,schedule:summary.schedule,allocations:summary.allocations,assessments:summary.assessments,
  nextUnpaidDueDate:summary.nextUnpaidDueDate,balanceCents:summary.balanceCents,outstandingPenaltyCents:summary.outstandingPenaltyCents,advanceCoveredMonths:summary.advanceCoveredMonths,advanceCoveredThrough:summary.advanceCoveredThrough,riskStatus:summary.riskStatus,category:summary.category,consecutiveUnpaidMonths:summary.consecutiveUnpaidMonths};
 const push={},set={};
 if(summary.currentPenaltySummary){const last=account.penaltySnapshots?.at(-1),entry={kind:'NON_FINANCIAL_SNAPSHOT',asOf,period:asOf.slice(0,7),summary:summary.currentPenaltySummary};if(JSON.stringify(last?.summary)!==JSON.stringify(entry.summary))push.penaltySnapshots={...entry,...actor,timestamp:stamp}}

 const latest=account.allocationVersions?.at(-1);
 if(JSON.stringify(latest?.allocations)!==JSON.stringify(summary.allocations))push.allocationVersions={version:(account.allocationVersions?.length||0)+1,allocations:summary.allocations,schedule:summary.schedule,reason,...actor,timestamp:stamp};
 const previous=new Map();for(const event of account.penaltyLedger||[])previous.set(event.assessmentId,event.updatedValues);
 const desired=new Map(summary.assessments.map(a=>[a.assessmentId,a])),penalties=[];
 for(const key of new Set([...previous.keys(),...desired.keys()])){
  const before=previous.get(key),after=desired.get(key)||null;
  if((before?.amountCents||0)===(after?.amountCents||0)&&(before?.waivedCents||0)===(after?.waivedCents||0))continue;
  penalties.push({eventId:randomUUID(),assessmentId:key,action:!after?"REVERSED":!before?"ASSESSED":"ADJUSTED",previousValues:before||null,updatedValues:after,reason,...actor,timestamp:stamp});
 }
 if(penalties.length)push.penaltyLedger={$each:penalties};
 const notifications=structuredClone(account.notifications||[]),active=new Map(),terms=account.contract.monitoringTerms;
 if(!account.pendingCancellation&&!["TRANSFERRED","CANCELLED"].includes(account.lifecycle)&&terms&&!account.migration?.monitoringHold&&!["CANCELLED","FORFEITED","TRANSFERRED","FULLY_PAID"].includes(account.migration?.historicalStatus)){
  for(const s of summary.schedule.filter(s=>s.balanceCents>0)){
   let status=s.overdue?(s.penaltyHistory.some(a=>a.balanceCents>0)?"OVERDUE_WITH_PENALTY":"OVERDUE"):asOf===s.dueDate?"DUE_TODAY":asOf>s.dueDate?"WITHIN_GRACE_PERIOD":asOf>=addDays(s.dueDate,-terms.reminderDays)?"UPCOMING_DUE":null;
   if(s.overdue)active.set(`grace:${s.installmentId}:${s.graceEnd}`,{status:"GRACE_PERIOD_EXPIRED",message:`${account.assignmentId}: grace expired for installment ${s.installment} after ${s.graceEnd}`});
   if(status)active.set(`${s.installmentId}:${s.dueDate}:${status}`,{status,message:`${account.assignmentId}: ${status.replaceAll("_"," ")} — ${s.installment===0?"down payment":`installment ${s.installment}`} due ${s.dueDate}`});
  }
  if(["CRITICAL","FORFEITURE_REVIEW_REQUIRED"].includes(summary.riskStatus))active.set(`risk:${summary.riskStatus}`,{status:summary.riskStatus,message:`${account.assignmentId}: ${summary.riskStatus.replaceAll("_"," ")} (${summary.consecutiveUnpaidMonths} consecutive unpaid months)`});
  for(const a of summary.assessments)active.set(`penalty:${a.assessmentId}`,{status:"PENALTY_ASSESSED",message:`${account.assignmentId}: penalty assessed for installment ${a.installment} on ${a.cycleDate}`,resolved:a.balanceCents===0});
  for(const p of summary.payments){if((summary.allocations[p.paymentId]||[]).some(a=>a.allocationType==="ADVANCE"))active.set(`advance:${p.paymentId}:${p.revision||0}`,{status:"ADVANCE_PAYMENT_RECORDED",message:`${account.assignmentId}: advance payment ${p.paymentId} recorded`,resolved:true})}
 }
 for(const n of notifications.filter(n=>n.monitoringAlert&&n.active))if(!active.has(n.alertKey)||active.get(n.alertKey).resolved){n.active=false;n.resolvedAt=stamp}
 for(const [alertKey,entry]of active){
  if(notifications.some(n=>n.monitoringAlert&&n.alertKey===alertKey&&(n.active||entry.resolved)))continue;
  const recurrence=notifications.filter(n=>n.alertKey===alertKey).length;
  for(const recipient of ["ADMIN","STAFF"]){notifications.push({id:`monitor:${alertKey}:${recurrence}:${recipient}`,alertKey,monitoringAlert:true,eventOnly:["PENALTY_ASSESSED","ADVANCE_PAYMENT_RECORDED"].includes(entry.status),active:!entry.resolved,resolvedAt:entry.resolved?stamp:null,recipient,...entry,createdAt:stamp,readBy:[]})}
 }
 const commission=commissionMutation(account,summary,actor,reason);
 if(commission.changed)set.commissionSnapshot=commission.snapshot;
 if(commission.events.length)push.commissionEvents={$each:commission.events};
 notifications.push(...commission.notifications);
 if(JSON.stringify(notifications)!==JSON.stringify(account.notifications||[]))set.notifications=notifications;
 if(JSON.stringify(snapshot)!==JSON.stringify(account.monitoring))set.monitoring=snapshot;
 if(!Object.keys(set).length&&!Object.keys(push).length)return {summary,changed:false};
 const compact=value=>value?Object.fromEntries(["asOf","nextUnpaidDueDate","balanceCents","outstandingPenaltyCents","advanceCoveredMonths","advanceCoveredThrough","riskStatus","category","consecutiveUnpaidMonths"].map(k=>[k,value[k]])):null;
 push.auditEvents={action:"ACCOUNT_MONITORING_RECALCULATED",previousValues:compact(account.monitoring),updatedValues:compact(snapshot),allocationVersion:push.allocationVersions?.version,penaltyEventIds:penalties.map(p=>p.eventId),reason,...actor,timestamp:stamp};
 return {summary,changed:true,update:{$set:set,$push:push}};
}
export async function reconcileAccount(accountId,actor,reason){
 for(let attempt=0;attempt<5;attempt++){
  const account=await PropertyAssignment.findById(accountId).lean();if(!account)return null;
  const result=monitoringMutation(account,actor,reason);if(!result.changed)return account;
  const updated=await PropertyAssignment.findOneAndUpdate({_id:account._id,__v:account.__v??0},{...result.update,$inc:{__v:1}},{new:true,runValidators:true}).lean();if(updated)return updated;
 }
 throw Object.assign(new Error("Account changed during monitoring. Refresh and retry."),{statusCode:409});
}
let running=false;
export async function reconcileAll(){
 if(running)return;running=true;
 try{for await(const account of PropertyAssignment.find({$or:[{"contract.monitoringTerms":{$ne:null}},{commissionAgreement:{$ne:null}}]}).select("_id").cursor()){try{await reconcileAccount(account._id)}catch(error){console.error("Monitoring reconciliation failed for account",String(account._id),error.message)}}}finally{running=false}
}
export function startMonitoring(){reconcileAll().catch(e=>console.error("Monitoring reconciliation failed",e.message));const timer=setInterval(()=>reconcileAll().catch(e=>console.error("Monitoring reconciliation failed",e.message)),60000);timer.unref();return()=>clearInterval(timer)}
export function attachMonitoringUpdate(account,update,actor,reason){
 const monitoring=monitoringMutation(account,actor,reason);if(!monitoring.changed)return update;
 const combined={...update,$set:{...(update.$set||{}),...monitoring.update.$set},$push:{...(update.$push||{})}};
 for(const [key,value]of Object.entries(monitoring.update.$push)){
  if(!combined.$push[key])combined.$push[key]=value;
  else combined.$push[key]={$each:[...(combined.$push[key].$each||[combined.$push[key]]),...(value.$each||[value])]};
 }
 return combined;
}
