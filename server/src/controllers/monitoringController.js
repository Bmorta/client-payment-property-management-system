import mongoose from "mongoose";
import PropertyAssignment from "../models/PropertyAssignment.js";
import {calendarDay} from "../utils/contractMonitoring.js";
import {summarizeAccount,today,validDate,moneyCents} from "../utils/accounting.js";
import {attachMonitoringUpdate,reconcileAccount} from "../services/monitoringService.js";
const fail=(code,message)=>{throw Object.assign(new Error(message),{statusCode:code})};
const actor=req=>({userId:req.user._id,username:req.user.username,role:req.user.role});
export async function listMonitoring(req,res,next){
 try{
  const asOf=req.query.asOf||today();if(!validDate(asOf))fail(400,"Choose a valid monitoring date.");
  const filter={};if(req.query.project){if(!mongoose.isValidObjectId(req.query.project))fail(400,"Invalid project.");filter.project=req.query.project}
  const accounts=await PropertyAssignment.find(filter).populate("client","clientId firstName lastName middleName suffix status").populate("project","projectName projectCode").populate("property","phaseNumber blockNumber lotNumber").lean();
  const ranks={FORFEITURE_REVIEW_REQUIRED:0,CRITICAL:1,WARNING:2,NORMAL:3,NOT_CONFIGURED:4};
  let rows=accounts.filter(a=>a.contract.contractDate<=asOf).map(a=>({accountId:a._id,assignmentId:a.assignmentId,client:a.client,project:a.project,property:a.property,contract:a.contract,summary:summarizeAccount(a,asOf),review:a.forfeitureReviews?.filter(r=>calendarDay(r.timestamp)<=asOf).at(-1)||null}));
  const counts=Object.fromEntries(["UPCOMING_DUE","DUE_TODAY","OVERDUE","PAID_IN_ADVANCE","CRITICAL","FORFEITURE_REVIEW_REQUIRED"].map(k=>[k,rows.filter(r=>!["FORFEITED","SUPERSEDED"].includes(r.summary.category)&&(k==="OVERDUE"?r.summary.schedule.some(s=>s.overdue):k==="PAID_IN_ADVANCE"?r.summary.advanceCoveredMonths>0:k==="UPCOMING_DUE"?r.summary.schedule.some(s=>s.balanceCents>0&&s.dueDate>asOf&&r.contract.monitoringTerms&&asOf>=new Date(Date.parse(s.dueDate)-r.contract.monitoringTerms.reminderDays*86400000).toISOString().slice(0,10)):k==="DUE_TODAY"?r.summary.schedule.some(s=>s.balanceCents>0&&s.dueDate===asOf):r.summary.riskStatus===k)).length]));
  for(const key of ['PAYING','PRINCIPAL_FULLY_PAID','SETTLED'])counts[key]=rows.filter(r=>r.summary.settlement?.status===key).length;
  if(req.query.status)rows=rows.filter(r=>(req.query.status==="OVERDUE"&&r.summary.schedule.some(s=>s.overdue))||(req.query.status==="PAID_IN_ADVANCE"&&r.summary.advanceCoveredMonths>0)||r.summary.settlement?.status===req.query.status||r.summary.category===req.query.status||r.summary.riskStatus===req.query.status||r.client?.status===req.query.status);
  rows.sort((a,b)=>(ranks[a.summary.riskStatus]-ranks[b.summary.riskStatus])||(b.summary.consecutiveUnpaidMonths-a.summary.consecutiveUnpaidMonths));
  res.json({success:true,data:{asOf,projection:asOf>today(),counts,rows}});
 }catch(e){next(e)}
}
async function accountFor(req){if(!mongoose.isValidObjectId(req.params.id))fail(400,"Invalid account.");const a=await PropertyAssignment.findById(req.params.id).lean();if(!a)fail(404,"Account not found.");if(req.body.confirm!==true||String(req.body.reason||"").trim().length<5)fail(400,"Confirm the action and enter a reason (at least 5 characters).");return a}
export async function waivePenalty(req,res,next){
 try{
  const a=await accountFor(req),previous=a.penaltyWaivers?.find(w=>w.requestId===req.body.requestId);
  if(previous){if(previous.assessmentId!==req.body.assessmentId||previous.amountCents!==moneyCents(req.body.amount)||previous.reason!==String(req.body.reason).trim())fail(409,"Submission ID already used for another waiver.");return res.json({success:true,message:"Waiver already recorded."})}
  if(req.body.expectedVersion!==a.__v)fail(409,"Account changed. Refresh and review again.");
  const summary=summarizeAccount(a),assessment=summary.assessments.find(p=>p.assessmentId===req.body.assessmentId),amountCents=moneyCents(req.body.amount);
  if(!assessment||!amountCents||amountCents>assessment.balanceCents)fail(400,"Choose an outstanding penalty and an amount within its balance.");
  const requestId=req.body.requestId;if(typeof requestId!=="string"||requestId.length<16||requestId.length>100)fail(400,"Invalid submission ID.");
  if(a.penaltyWaivers?.some(w=>w.requestId===requestId))return res.json({success:true,message:"Waiver already recorded."});
  const waiver={effectiveDate:today(),requestId,assessmentId:assessment.assessmentId,amountCents,reason:String(req.body.reason).trim(),...actor(req),timestamp:new Date()};
  const proposed={...a,penaltyWaivers:[...(a.penaltyWaivers||[]),waiver]};
  const update=attachMonitoringUpdate(proposed,{$push:{penaltyWaivers:waiver,auditEvents:{action:"PENALTY_WAIVED",previousValues:assessment,updatedValues:waiver,...actor(req),timestamp:new Date()}},$inc:{__v:1}},actor(req),waiver.reason);
  const result=await PropertyAssignment.findOneAndUpdate({_id:a._id,__v:a.__v},update,{new:true,runValidators:true}).lean();if(!result)fail(409,"Account changed. Refresh before retrying.");
  res.json({success:true,message:"Penalty waiver recorded. Original assessment preserved.",data:{summary:summarizeAccount(result)}});
 }catch(e){next(e)}
}
export async function reviewForfeiture(req,res,next){
 try{
  const a=await accountFor(req),previous=a.forfeitureReviews?.find(r=>r.requestId===req.body.requestId);
  if(previous){if(previous.status!==req.body.status||previous.reason!==String(req.body.reason).trim())fail(409,"Submission ID already used for another review.");return res.json({success:true,message:"Review already recorded."})}
  if(req.body.expectedVersion!==a.__v)fail(409,"Account changed. Refresh and review again.");
  if(typeof req.body.requestId!=="string"||req.body.requestId.length<16||req.body.requestId.length>100)fail(400,"Invalid submission ID.");
  if(['FORFEITED','SUPERSEDED'].includes(a.lifecycle))fail(409,'This is a closed forfeited contract. Use its reviewed reactivation workflow.');
  const summary=summarizeAccount(a),status=req.body.status;
  const statuses=["NORMAL","WARNING","CRITICAL","FORFEITURE_REVIEW_REQUIRED","UNDER_REVIEW","NOTICE_ISSUED","APPROVED_FOR_FORFEITURE","FORFEITED","RESOLVED_REINSTATED"];
  if(!statuses.includes(status))fail(400,"Choose a valid review status.");
  const last=a.forfeitureReviews?.at(-1),notice=String(req.body.noticeReference||"").trim().slice(0,500);
  if(["UNDER_REVIEW","NOTICE_ISSUED","APPROVED_FOR_FORFEITURE","FORFEITED"].includes(status)&&summary.riskStatus!=="FORFEITURE_REVIEW_REQUIRED")fail(409,"The rechecked allocations do not meet the contractual review threshold.");
  if(["NOTICE_ISSUED","APPROVED_FOR_FORFEITURE","FORFEITED"].includes(status)&&(!notice||req.body.legalReviewConfirmed!==true))fail(400,"Record the notice/legal review reference and confirm administrator review of contractual and legal requirements.");
  if(status==="FORFEITED")fail(409,"Use Approve Forfeiture in the property contract workflow to close the actual contract and reserve the lot. Review labels alone cannot forfeit a property.");
  if(status==="FORFEITED"&&last?.status!=="APPROVED_FOR_FORFEITURE")fail(409,"Administrator approval for forfeiture must be recorded first.");
  if(status==="RESOLVED_REINSTATED"&&summary.consecutiveUnpaidMonths>0)fail(409,"Unpaid overdue installments remain. Keep the account under review or update its payments.");
  const entry={requestId:req.body.requestId,status,noticeReference:notice,reason:String(req.body.reason).trim(),...actor(req),timestamp:new Date(),riskSnapshot:{riskStatus:summary.riskStatus,consecutiveUnpaidMonths:summary.consecutiveUnpaidMonths,nextUnpaidDueDate:summary.nextUnpaidDueDate,advanceCoveredThrough:summary.advanceCoveredThrough}};
  const update=attachMonitoringUpdate(a,{$push:{forfeitureReviews:entry,notifications:{$each:["ADMIN","STAFF"].map(recipient=>({id:`review:${a._id}:${a.forfeitureReviews?.length||0}:${recipient}`,recipient,monitoringAlert:true,eventOnly:true,status:"FORFEITURE_REVIEW_STATUS_CHANGED",message:`${a.assignmentId}: review status ${status.replaceAll("_"," ")}`,createdAt:new Date(),readBy:[]}))},auditEvents:{action:"FORFEITURE_REVIEW_UPDATED",previousValues:last||null,updatedValues:entry,...actor(req),timestamp:new Date()}},$inc:{__v:1}},actor(req),entry.reason);
  // Merge notifications into the same document update; never release/reassign the lot.
  if(update.$set?.notifications){const additions=update.$push.notifications.$each;update.$set.notifications.push(...additions);delete update.$push.notifications}
  const result=await PropertyAssignment.findOneAndUpdate({_id:a._id,__v:a.__v},update,{new:true,runValidators:true}).lean();if(!result)fail(409,"Account changed. Refresh and recheck risk.");
  res.json({success:true,message:"Administrator review recorded. Property ownership and availability were not changed."});
 }catch(e){next(e)}
}
export async function refreshMonitoring(req,res,next){try{await reconcileAccount(req.params.id,actor(req),"Administrator requested reconciliation");res.json({success:true,message:"Account monitoring refreshed."})}catch(e){next(e)}}
