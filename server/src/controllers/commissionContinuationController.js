import {reconcileCommissionLineage,commissionLineageTimeline} from '../utils/commissionLineage.js';
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
export async function continuationOptions(req,res,next){try{const target=await load(req.params.id);let reconciliation=null;try{const r=await reconcileCommissionLineage([target],id=>load(id));reconciliation={status:'CONSISTENT',timeline:commissionLineageTimeline(r.accounts),agents:r.agents,contracts:r.accounts.map(a=>({id:String(a._id),contractId:a.assignmentId})),sequence:r.sequence,rootAgreementIds:r.rootAgreementIds}}catch(e){reconciliation={status:'REVIEW_REQUIRED',message:e.message,conflicts:e.conflicts||[]}}res.json({success:true,data:{targetId:String(target._id),targetContract:target.assignmentId,contractPriceCents:target.contract.totalCents,sources:await candidates(target),current:target.commissionContinuation||null,reconciliation,history:target.commissionAgreementHistory||[]}})}catch(e){next(e)}}
async function prepare(targetId,body,session){
 const target=await load(targetId,session),ids=body.sourceIds||[body.sourceId];if(!Array.isArray(ids)||!ids.length||new Set(ids.map(String)).size!==ids.length)fail('Choose unique original agreements.');const sources=await Promise.all(ids.map(id=>load(id,session))),source=sources[0];
 for(const item of sources){if(!same(item.client,target.client)||!related(item,target))fail('Every consolidation source must have a verified approved contract link to the receiving contract.');if(!same(item._id,target._id)&&!['TRANSFERRED','CANCELLED'].includes(item.lifecycle))fail('Finalize every source contract action before consolidating commissions.');if(item.commissionContinuationOut)fail(`Contract ${item.assignmentId} is already superseded. Select its currently effective successor agreement.`);}
 if(!same(source.client,target.client)||!related(source,target))fail('Choose a contract linked by the approved transfer or cancellation/amendment.');
 if(target.lifecycle!=='ACTIVE'||target.pendingCancellation||target.cancellationReview?.status==='UNDER_REVIEW')fail('Receiving contract must be active and outside cancellation review.');
 if(!same(source._id,target._id)&&!['TRANSFERRED','CANCELLED'].includes(source.lifecycle))fail('Finalize the source transfer/cancellation before commission continuation.');
 if(source.commissionContinuationOut)fail('This source agreement already has a continuation. Review its linked history; it cannot be assigned twice.');
 if(!source.commissionAgreement)fail('Original commission agreement is missing.');
 const effectiveDate=body.effectiveDate,eventDate=target.transferIn?.effectiveDate||target.creditAmendments?.at(-1)?.effectiveDate||target.contract.contractDate;
 if(!validDate(effectiveDate)||effectiveDate<eventDate||effectiveDate>today())fail('Choose an effective date on/after the contract change and no later than today.',400);
 if([...sources,target].some(a=>a.commissionContinuation?.effectiveDate>effectiveDate)||target.commissionAgreement&&(target.payments||[]).map(effectivePayment).some(p=>p.paymentDate>effectiveDate))fail('The amendment cannot predate the current approved agreement or preserved receiving-contract payments.');
 const ledger=allocatePayments(target),sourceRecords=calculateCommissions(source,allocatePayments(source)).records,targetRecords=same(source._id,target._id)?[]:calculateCommissions(target,ledger).records;
 if([...sourceRecords,...targetRecords].some(r=>r.recoveryDueCents>0||r.historicalVerificationCents>0))fail('Resolve commission recovery and historical verification restrictions before reconfiguration.');
 if(target.commissionAgreement&&!same(source._id,target._id)&&body.confirmTargetReplacement!==true)fail('Explicitly confirm replacing the receiving agreement prospectively; its earned commissions and payout IDs remain preserved.');
 const heads=[...sources];if(target.commissionAgreement&&!heads.some(a=>same(a._id,target._id)))heads.push(target);
 if(heads.length>1&&body.confirmConsolidation!==true)fail('Explicitly confirm consolidating every listed source and receiving agreement.');
 const lineage=await reconcileCommissionLineage(heads,id=>load(id,session),{verifyMissingLink:body.confirmHistoricalLineage===true?(parent,child)=>related(parent,child)&&['TRANSFERRED','CANCELLED'].includes(parent.lifecycle):undefined});
 if(lineage.agents.some(a=>a.recoveryDueCents||a.historicalVerificationCents))fail('Resolve the identified recovery or historical-verification records across the complete lineage.');
 const originalAgents=new Map();for(const head of heads)for(const a of head.commissionAgreement?.agents||[]){const key=String(a.agent);if(!originalAgents.has(key))originalAgents.set(key,{...a,agent:key});else if(body.option==='RETAIN'&&originalAgents.get(key).percentageBps!==a.percentageBps)fail(`Agent ${a.agentId} has different approved rates across sources. Use an explicitly approved revised computation.`);}
 const allocations=body.agents||[...originalAgents.values()];
 const agreement={...source.commissionAgreement,agents:[...originalAgents.values()],agentTerms:{},completedOffsets:{}};
 const inputRecords=lineage.records.map(r=>{const head=heads.find(h=>same(h._id,r.ownerAccountId)),active=!!head&&(!head.commissionContinuation||r.continuationId===head.commissionContinuation.id);return {...r,type:active?r.type:'LINEAGE_EARNED',budgetCents:active?r.budgetCents:r.earnedCents,lineagePeriodId:r.lineagePeriodId||`${r.ownerAccountId}:${r.commissionId}`,inheritedSourceAllocations:[...(r.inheritedSourceAllocations||[]),...(r.sourceAllocations||[])]}});
 for(const agent of agreement.agents){let n=0,offset=0;for(const head of heads){const current=head.commissionContinuation?.plans.find(a=>same(a.agent,agent.agent));offset+=current?.completedInstallments||0;}
  for(const r of inputRecords.filter(r=>same(r.agent,agent.agent)&&r.type==='MONTHLY')){r.originalPeriod=r.period;n++;if(heads.length>1)r.period=n;}
  agreement.agentTerms[agent.agent]=n+offset;agreement.completedOffsets[agent.agent]=offset;
 }
 const agents=allocations.map(a=>({...a,agent:String(a.agent),percentageBps:a.percentageBps}));
 const basis=body.basis===undefined?target.contract.totalCents:moneyCents(body.basis);
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
  const cashRequirements=body.option==='RETAIN'?schedule.map(r=>Math.max(0,r.basisCents-r.collectedCents)):agreement.monthlyEarningRule==='COMPLETED_BUYER_INSTALLMENTS'?periods.slice(0,schedule.length).map(r=>r.cents):splitCommission(periods.reduce((n,r)=>n+r.cents,0),Math.max(1,schedule.length));
  if(cashRequirements.length<schedule.length||schedule.some((r,i)=>r.amountCents>0&&!(cashRequirements[i]>0))){agent.issues.push('Insufficient qualifying cash installment periods; administrator review required.');agent.requiresReview=true;}
  schedule.forEach((r,i)=>r.requiredCashCents=cashRequirements[i]||0);
  if(agent.downPaymentContinuation)agent.futureSchedule.unshift(agent.downPaymentContinuation);
 }
 plan.requiresReview=plan.agents.some(a=>a.requiresReview);
 const reason=String(body.reason||'').trim(),remarks=String(body.remarks||'').trim();if(reason.length<5||reason.length>500||remarks.length>1000)fail('Enter a 5–500 character adjustment reason and remarks up to 1,000 characters.',400);
 const result={sourceId:String(source._id),targetId:String(target._id),sourceContract:source.assignmentId,targetContract:target.assignmentId,originalPriceCents:source.contract.totalCents,revisedPriceCents:target.contract.totalCents,basisCents:basis,option:body.option,effectiveDate,reason,remarks,overrideReason:String(body.overrideReason||''),plan,sourceRecords,targetRecords,sourceSnapshots:sources.map(a=>({id:String(a._id),records:calculateCommissions(a,allocatePayments(a)).records})),lineage:{repairs:lineage.repairs,rootAgreementIds:lineage.rootAgreementIds,sequence:lineage.sequence,contracts:lineage.accounts.map(a=>({id:String(a._id),contractId:a.assignmentId,propertyId:String(a.property?._id||a.property||''),agreementId:a.commissionAgreement?.agreementId||`CA-${a.assignmentId}`,version:a.__v})),agents:lineage.agents},receivingOriginalAgreement:target.commissionAgreement||null,excludedPaymentIds};
 result.token=digest({accounts:lineage.accounts,target,input:body,result});return {source,target,result};
}
export async function previewContinuation(req,res,next){try{const {result}=await prepare(req.params.id,req.body);res.json({success:true,data:result})}catch(e){next(e)}}
export async function approveContinuation(req,res,next){let session;try{
 if(req.body.confirm!==true||!/^[A-Za-z0-9_-]{16,100}$/.test(req.body.requestId||''))fail('Explicit confirmation and a unique submission ID are required.',400);
 session=await mongoose.startSession();let result;
 await session.withTransaction(async()=>{
  const existing=await load(req.params.id,session);if(existing.commissionContinuation?.requestId===req.body.requestId){if(existing.commissionContinuation.inputHash!==digest(req.body.input))fail('Submission ID was reused with different details.');result=existing.commissionContinuation;return}
  const {source,target,result:p}=await prepare(req.params.id,req.body.input,session);
  if(req.body.token!==p.token)fail('Contracts, payments or configuration changed. Review a fresh preview.');if(p.plan.requiresReview)fail('Resolve the preview review issues before approval.');
  const actor={userId:req.user._id,username:req.user.username,role:req.user.role,timestamp:new Date()},id=randomUUID(),continuation={id,requestId:req.body.requestId,inputHash:digest(req.body.input),sourceId:p.sourceId,sourceIds:[...new Set([...p.sourceSnapshots.filter(a=>!same(a.id,target._id)).map(a=>a.id),...(target.commissionContinuation?.sourceIds||[target.commissionContinuation?.sourceId].filter(v=>v&&!same(v,target._id)))])],originalAgreementIds:p.lineage.rootAgreementIds,previousAgreementIds:p.sourceSnapshots.map(a=>p.lineage.contracts.find(c=>same(c.id,a.id))?.agreementId),currentAgreementId:`CA-${id}`,amendmentSequence:p.lineage.sequence,lineage:p.lineage,sourceContract:p.sourceContract,option:p.option,effectiveDate:p.effectiveDate,plans:p.plan.agents,preservedRecords:same(source._id,target._id)?p.sourceRecords:p.targetRecords,excludedPaymentIds:p.excludedPaymentIds,reason:p.reason,remarks:p.remarks,...actor};
  const agreement={...source.commissionAgreement,agreementId:continuation.currentAgreementId,originalAgreementIds:p.lineage.rootAgreementIds,previousAgreementIds:continuation.previousAgreementIds,amendmentSequence:p.lineage.sequence,agents:p.plan.agents.map(a=>({agent:a.agent,agentId:a.agentId,percentageBps:a.percentageBps})),percentageBps:req.body.input.authorizedPercentageBps??source.commissionAgreement.percentageBps,version:(target.commissionAgreement?.version||0)+1,continuationId:id,termMonths:p.option==='RECALCULATE'?Number(req.body.input.termMonths):source.commissionAgreement.termMonths,contractTotalCents:target.contract.totalCents,commissionBasisCents:p.basisCents,propertyBudgetCents:p.plan.agents.reduce((n,a)=>n+a.entitlementCents,0),effectiveDate:p.effectiveDate};
  const history={action:'COMMISSION_RECONFIGURED',previousValues:target.commissionAgreement||null,updatedValues:agreement,preview:p,reason:p.reason,...actor};
  for(const snapshot of p.sourceSnapshots){if(same(snapshot.id,target._id))continue;const prior=await load(snapshot.id,session);
   const outgoing={id,targetId:String(target._id),records:snapshot.records};
   const update=attachMonitoringUpdate({...prior,commissionContinuationOut:outgoing},{$set:{commissionContinuationOut:outgoing},$push:{commissionAgreementHistory:history,auditEvents:history}},actor,p.reason);
   const changed=await PropertyAssignment.updateOne({_id:prior._id,__v:prior.__v},{...update,$inc:{__v:1}},{session});if(!changed.modifiedCount)fail('A source agreement changed.');
  }
  for(const ancestor of p.lineage.contracts){if(same(ancestor.id,target._id)||p.sourceSnapshots.some(s=>same(s.id,ancestor.id)))continue;const repair=p.lineage.repairs.find(r=>same(r.sourceId,ancestor.id));let repairUpdate={};if(repair){const prior=await load(ancestor.id,session),outgoing={id,targetId:repair.targetId,records:repair.records};repairUpdate=attachMonitoringUpdate({...prior,commissionContinuationOut:outgoing},{$set:{commissionContinuationOut:outgoing},$push:{auditEvents:{action:'COMMISSION_LINEAGE_LINK_RECONSTRUCTED',sourceContract:repair.sourceContract,targetContract:repair.targetContract,reason:p.reason,...actor}}},actor,p.reason)}const fence=await PropertyAssignment.updateOne({_id:ancestor.id,__v:ancestor.version},{...repairUpdate,$inc:{__v:1}},{session});if(!fence.modifiedCount)fail(`${ancestor.contractId}: lineage changed during approval.`);}
  const update=attachMonitoringUpdate({...target,commissionAgreement:agreement,commissionContinuation:continuation},{$set:{commissionAgreement:agreement,commissionContinuation:continuation},$push:{commissionAgreementHistory:history,auditEvents:history}},actor,p.reason);
  const changed=await PropertyAssignment.updateOne({_id:target._id,__v:target.__v},{...update,$inc:{__v:1}},{session});if(!changed.modifiedCount)fail('Receiving agreement changed.');result=continuation;
 });res.json({success:true,data:result,message:'Commission continuation approved. Original earnings and payouts preserved; future qualifying cash uses the reviewed schedule.'});
 }catch(e){next(e)}finally{await session?.endSession()}}
