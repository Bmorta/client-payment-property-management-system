import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import PropertyAssignment from '../models/PropertyAssignment.js';
import {allocatePayments,effectivePayment} from '../utils/paymentLedger.js';
import {calculateCommissions,splitCommission,percentAmount} from '../utils/commissionLedger.js';
import {commissionReconfigurationPlan} from '../utils/commissionReconfigurationPlan.js';
import {digest} from '../utils/commissionReconciliation.js';
import {moneyCents,today,validDate} from '../utils/accounting.js';
import {attachMonitoringUpdate} from '../services/monitoringService.js';
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode})};
const query=(q,session)=>session?q.session(session):q;
async function load(id,session){if(!mongoose.isValidObjectId(id))fail('Invalid contract identifier.',400);const a=await query(PropertyAssignment.findById(id),session).lean();if(!a)fail('Contract not found.',404);return a}
const same=(a,b)=>String(a)===String(b);
function related(source,target){return same(source._id,target._id)?!!(target.creditAmendments?.length||target.agreementHistory?.length||target.commissionContinuation):same(target.transferIn?.sourceId,source._id)||target.creditAmendments?.some(t=>source.cancellationOut?.caseId&&same(t.caseId,source.cancellationOut.caseId));}
async function candidates(target,session){const ids=new Set([target.transferIn?.sourceId,...(target.creditAmendments||[]).map(x=>x.caseId)].filter(Boolean).map(String));const filter={$or:[{_id:target._id},{'transferOut.replacementId':target._id},...(ids.size?[{'cancellationOut.caseId':{$in:[...ids]}}]:[])]};const rows=await query(PropertyAssignment.find({...filter,client:target.client}),session).lean();return rows.filter(s=>s.commissionAgreement&&related(s,target)).map(s=>({id:String(s._id),assignmentId:s.assignmentId,contractPriceCents:s.contract.totalCents,agreement:s.commissionAgreement,alreadyContinued:!!s.commissionContinuationOut}));}
export async function continuationOptions(req,res,next){try{const target=await load(req.params.id);res.json({success:true,data:{targetId:String(target._id),targetContract:target.assignmentId,contractPriceCents:target.contract.totalCents,sources:await candidates(target),current:target.commissionContinuation||null,history:target.commissionAgreementHistory||[]}})}catch(e){next(e)}}
async function prepare(targetId,body,session){
 const target=await load(targetId,session),source=await load(body.sourceId,session);
 if(!same(source.client,target.client)||!related(source,target))fail('Choose a contract linked by the approved transfer or cancellation/amendment.');
 if(target.lifecycle!=='ACTIVE'||target.pendingCancellation||target.cancellationReview?.status==='UNDER_REVIEW')fail('Receiving contract must be active and outside cancellation review.');
 if(!same(source._id,target._id)&&!['TRANSFERRED','CANCELLED'].includes(source.lifecycle))fail('Finalize the source transfer/cancellation before commission continuation.');
 if(source.commissionContinuation)fail('This agreement already contains linked commission lineage. Review and consolidate its complete source history before another reconfiguration; prior entitlement cannot be counted twice.');
 if(source.commissionContinuationOut)fail('This source agreement already has a continuation. Review its linked history; it cannot be assigned twice.');
 if(target.commissionContinuation&&!same(source._id,target._id))fail('This target already has a linked commission agreement. Use its own amendment workflow before consolidating another source.');
 if(!source.commissionAgreement)fail('Original commission agreement is missing.');
 const effectiveDate=body.effectiveDate,eventDate=target.transferIn?.effectiveDate||target.creditAmendments?.at(-1)?.effectiveDate||target.contract.contractDate;
 if(!validDate(effectiveDate)||effectiveDate<eventDate||effectiveDate>today())fail('Choose an effective date on/after the contract change and no later than today.',400);
 const ledger=allocatePayments(target),sourceRecords=calculateCommissions(source,allocatePayments(source)).records,targetRecords=same(source._id,target._id)?[]:calculateCommissions(target,ledger).records;
 if([...sourceRecords,...targetRecords].some(r=>r.recoveryDueCents>0||r.historicalVerificationCents>0))fail('Resolve commission recovery and historical verification restrictions before reconfiguration.');
 if(target.commissionAgreement&&!same(source._id,target._id)&&body.confirmTargetReplacement!==true)fail('Explicitly confirm replacing the receiving agreement prospectively; its earned commissions and payout IDs remain preserved.');
 if(targetRecords.some(r=>!source.commissionAgreement.agents.some(a=>same(a.agent,r.agent))))fail('Receiving-contract agent allocations differ. A separate allocation reconciliation is required.');
 const agreement=source.commissionAgreement,agents=(body.agents||agreement.agents).map(a=>({...a,agent:String(a.agent),percentageBps:a.percentageBps}));
 const basis=body.basis===undefined?target.contract.totalCents:moneyCents(body.basis);
 const inputRecords=sourceRecords.map(r=>({...r}));
 // Include the receiving agent's historical earnings in the same revised cap.
 for(const r of targetRecords)inputRecords.push({...r,commissionId:'target:'+r.commissionId,type:'PRESERVED_TARGET',budgetCents:r.earnedCents});
 const plan=commissionReconfigurationPlan({option:body.option,agreement,records:inputRecords,revisedBasisCents:basis,agents,authorizedPercentageBps:body.authorizedPercentageBps??agreement.percentageBps,termMonths:body.termMonths});
 const excludedPaymentIds=target.commissionAgreement?(target.payments||[]).map(p=>p.paymentId):(target.payments||[]).map(effectivePayment).filter(p=>p.paymentDate<effectiveDate||p.origin==='HISTORICAL').map(p=>p.paymentId);
 const eligible=Object.entries(ledger.allocations).filter(([id])=>!excludedPaymentIds.includes(id)).flatMap(([,rows])=>rows.filter(r=>['INSTALLMENT','ADVANCE','DOWN_PAYMENT'].includes(r.allocationType)&&r.effectiveDate>=effectiveDate));
 const periods=ledger.schedule.filter(s=>s.installment>0).map(s=>({period:s.installment,cents:Math.max(0,s.balanceCents)+eligible.filter(r=>r.installment===s.installment).reduce((n,r)=>n+r.amountCents,0)})).filter(s=>s.cents>0);
 for(const agent of plan.agents){
  const dp=ledger.schedule.find(s=>s.installment===0),dpCashCents=Math.max(0,dp?.balanceCents||0)+eligible.filter(r=>r.allocationType==='DOWN_PAYMENT').reduce((n,r)=>n+r.amountCents,0);
  const dpEarned=inputRecords.filter(r=>same(r.agent,agent.agent)&&r.type==='DP').reduce((n,r)=>n+r.earnedCents,0);
  const dpBudget=body.option==='RECALCULATE'?Math.min(agent.futureCents,Math.max(0,percentAmount(Math.min(basis,dpCashCents),agent.percentageBps)-dpEarned)):0;
  const monthlyFutureCents=agent.futureCents-dpBudget;
  if(dpBudget){agent.futureSchedule=agent.futureSchedule.map((r,i)=>({...r,amountCents:splitCommission(monthlyFutureCents,agent.futureSchedule.length)[i]}));agent.downPaymentContinuation={type:'DP',period:0,amountCents:dpBudget,requiredCashCents:dpCashCents,basisCents:dpCashCents,originalBudgetCents:dpBudget,preservedEarnedCents:0,collectedCents:0};}

  const overrides=body.monthlyAmounts||{},override=overrides[agent.agent];
  if(override!==undefined&&String(override)!==''){
   const monthly=moneyCents(override),rows=agent.futureSchedule;if(body.option==='RETAIN')fail('Original installment amounts are fixed under Retain.');
   if(!rows.length||monthly<1||monthly*(rows.length-1)>monthlyFutureCents||monthlyFutureCents-monthly*(rows.length-1)<1)fail('Proposed monthly commission cannot reconcile with remaining entitlement.');
   if(String(body.overrideReason||'').trim().length<5)fail('Explain the monetary override.');
   agent.systemCalculatedSchedule=structuredClone(rows);rows.forEach((r,i)=>r.amountCents=i===rows.length-1?monthlyFutureCents-monthly*(rows.length-1):monthly);
  }
  const schedule=agent.futureSchedule;
  const basis=body.option==='RETAIN'?schedule.map(r=>Math.max(0,r.basisCents-r.collectedCents)):agreement.monthlyEarningRule==='COMPLETED_BUYER_INSTALLMENTS'?periods.slice(0,schedule.length).map(r=>r.cents):splitCommission(periods.reduce((n,r)=>n+r.cents,0),Math.max(1,schedule.length));
  if(basis.length<schedule.length||schedule.some((r,i)=>r.amountCents>0&&!(basis[i]>0))){agent.issues.push('Insufficient qualifying cash installment periods; administrator review required.');agent.requiresReview=true;}
  schedule.forEach((r,i)=>r.requiredCashCents=basis[i]||0);
  if(agent.downPaymentContinuation)agent.futureSchedule.unshift(agent.downPaymentContinuation);
 }
 plan.requiresReview=plan.agents.some(a=>a.requiresReview);
 const reason=String(body.reason||'').trim(),remarks=String(body.remarks||'').trim();if(reason.length<5||reason.length>500||remarks.length>1000)fail('Enter a 5–500 character adjustment reason and remarks up to 1,000 characters.',400);
 const result={sourceId:String(source._id),targetId:String(target._id),sourceContract:source.assignmentId,targetContract:target.assignmentId,originalPriceCents:source.contract.totalCents,revisedPriceCents:target.contract.totalCents,basisCents:basis,option:body.option,effectiveDate,reason,remarks,overrideReason:String(body.overrideReason||''),plan,sourceRecords,targetRecords,receivingOriginalAgreement:target.commissionAgreement||null,excludedPaymentIds};
 result.token=digest({source,target,input:body,result});return {source,target,result};
}
export async function previewContinuation(req,res,next){try{const {result}=await prepare(req.params.id,req.body);res.json({success:true,data:result})}catch(e){next(e)}}
export async function approveContinuation(req,res,next){let session;try{
 if(req.body.confirm!==true||!/^[A-Za-z0-9_-]{16,100}$/.test(req.body.requestId||''))fail('Explicit confirmation and a unique submission ID are required.',400);
 session=await mongoose.startSession();let result;
 await session.withTransaction(async()=>{
  const existing=await load(req.params.id,session);if(existing.commissionContinuation?.requestId===req.body.requestId){if(existing.commissionContinuation.inputHash!==digest(req.body.input))fail('Submission ID was reused with different details.');result=existing.commissionContinuation;return}
  const {source,target,result:p}=await prepare(req.params.id,req.body.input,session);
  if(req.body.token!==p.token)fail('Contracts, payments or configuration changed. Review a fresh preview.');if(p.plan.requiresReview)fail('Resolve the preview review issues before approval.');
  const actor={userId:req.user._id,username:req.user.username,role:req.user.role,timestamp:new Date()},id=randomUUID(),continuation={id,requestId:req.body.requestId,inputHash:digest(req.body.input),sourceId:p.sourceId,sourceContract:p.sourceContract,option:p.option,effectiveDate:p.effectiveDate,plans:p.plan.agents,preservedRecords:same(source._id,target._id)?p.sourceRecords:p.targetRecords,excludedPaymentIds:p.excludedPaymentIds,reason:p.reason,remarks:p.remarks,...actor};
  const agreement={...source.commissionAgreement,agents:p.plan.agents.map(a=>({agent:a.agent,agentId:a.agentId,percentageBps:a.percentageBps})),percentageBps:req.body.input.authorizedPercentageBps??source.commissionAgreement.percentageBps,version:(target.commissionAgreement?.version||0)+1,continuationId:id,termMonths:p.option==='RECALCULATE'?Number(req.body.input.termMonths):source.commissionAgreement.termMonths,contractTotalCents:target.contract.totalCents,commissionBasisCents:p.basisCents,propertyBudgetCents:p.plan.agents.reduce((n,a)=>n+a.entitlementCents,0),effectiveDate:p.effectiveDate};
  const history={action:'COMMISSION_RECONFIGURED',previousValues:target.commissionAgreement||null,updatedValues:agreement,preview:p,reason:p.reason,...actor};
  if(!same(source._id,target._id)){
   const update=attachMonitoringUpdate({...source,commissionContinuationOut:{id,targetId:String(target._id),records:p.sourceRecords}},{$set:{commissionContinuationOut:{id,targetId:String(target._id),records:p.sourceRecords}},$push:{commissionAgreementHistory:history,auditEvents:history}},actor,p.reason);
   const changed=await PropertyAssignment.updateOne({_id:source._id,__v:source.__v}, {...update,$inc:{__v:1}},{session});if(!changed.modifiedCount)fail('Source agreement changed.');
  }
  const update=attachMonitoringUpdate({...target,commissionAgreement:agreement,commissionContinuation:continuation},{$set:{commissionAgreement:agreement,commissionContinuation:continuation},$push:{commissionAgreementHistory:history,auditEvents:history}},actor,p.reason);
  const changed=await PropertyAssignment.updateOne({_id:target._id,__v:target.__v},{...update,$inc:{__v:1}},{session});if(!changed.modifiedCount)fail('Receiving agreement changed.');result=continuation;
 });res.json({success:true,data:result,message:'Commission continuation approved. Original earnings and payouts preserved; future qualifying cash uses the reviewed schedule.'});
 }catch(e){next(e)}finally{await session?.endSession()}}
