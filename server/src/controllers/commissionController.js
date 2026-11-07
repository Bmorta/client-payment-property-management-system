import {lockVoucher,finalizeVoucher,validateVoucherCorrection} from '../services/commissionVoucherService.js';
import {hasCommissionHistory,deletableCommission} from "../../../shared/commissionSafety.js";
import {previewCommission} from "../../../shared/commissionMath.js";
import {validateFunding,physicalFunding} from "../utils/fundingAccount.js";
import mongoose from "mongoose";
import Agent from "../models/Agent.js";
import Project from "../models/Project.js";
import PropertyAssignment from "../models/PropertyAssignment.js";
import {generateRecordId} from "../utils/generateRecordId.js";
import {allocatePayments} from "../utils/paymentLedger.js";
import {calculateCommissions,effectivePayout,percentAmount} from "../utils/commissionLedger.js";
import {attachMonitoringUpdate} from "../services/monitoringService.js";
import {moneyCents,validDate,today,METHODS} from "../utils/accounting.js";
const fail=(code,message)=>{throw Object.assign(new Error(message),{statusCode:code})};
const id=value=>{if(typeof value!=="string"||!mongoose.isValidObjectId(value))fail(400,"Invalid identifier.");return new mongoose.Types.ObjectId(value)};
const actor=req=>({userId:req.user._id,username:req.user.username,role:req.user.role,timestamp:new Date()});
const reason=req=>{const value=String(req.body.reason||"").trim();if(value.length<5||value.length>500)fail(400,"Enter a reason (5–500 characters).");return value};
const key=value=>{if(typeof value!=="string"||!/^[A-Za-z0-9_-]{16,100}$/.test(value))fail(400,"Invalid submission ID.");return value};
const escaped=s=>String(s||"").slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
async function agentFields(body){
 const fullName=String(body.fullName||"").trim(),agentType=String(body.agentType||"").trim();if(!fullName||fullName.length>160||!agentType||agentType.length>80||!["ACTIVE","INACTIVE"].includes(body.status))fail(400,"Enter an agent name, type and valid status.");
 if(!Array.isArray(body.assignedProjects)||body.assignedProjects.length>500)fail(400,"Choose valid assigned projects.");
 const projects=[...new Set(body.assignedProjects)].map(v=>id(v));if(await Project.countDocuments({_id:{$in:projects}})!==projects.length)fail(400,"An assigned project was not found.");
 return {fullName,agentType,status:body.status,assignedProjects:projects,...Object.fromEntries(["contactNumber","email","address"].map(k=>[k,String(body[k]||"").trim().slice(0,k==="address"?500:160)]))};
}
export async function listAgents(req,res,next){try{
 const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page)||1)),filter={};if(req.query.q)filter.$or=[{agentId:new RegExp(escaped(req.query.q),"i")},{fullName:new RegExp(escaped(req.query.q),"i")}];if(req.query.status){if(!["ACTIVE","INACTIVE"].includes(req.query.status))fail(400,"Invalid agent status.");filter.status=req.query.status}if(req.query.project){const project=id(req.query.project),assigned=await PropertyAssignment.distinct("commissionSnapshot.records.agent",{project});filter.$and=[{$or:[{assignedProjects:project},{_id:{$in:assigned.map(a=>id(a))}}]}]}
 const [rows,total]=await Promise.all([Agent.find(filter).populate("assignedProjects","projectName").sort({fullName:1,_id:1}).skip(req.listExport?0:(page-1)*20).limit(req.listExport?0:20).lean(),Agent.countDocuments(filter)]);res.json({success:true,data:rows,total,page,pageSize:20});
}catch(e){next(e)}}
export async function saveAgent(req,res,next){try{
 const data=await agentFields(req.body),entry={...actor(req),reason:reason(req)};let agent;
 if(req.params.id){const old=await Agent.findById(id(req.params.id)).lean();if(!old)fail(404,"Agent not found.");if(req.body.agentId!==undefined&&req.body.agentId!==old.agentId)fail(400,"Agent ID is read-only.");agent=await Agent.findOneAndUpdate({_id:old._id,__v:req.body.expectedVersion},{$set:data,$push:{history:{...entry,previousValues:Object.fromEntries(["agentId","fullName","contactNumber","email","address","agentType","status","assignedProjects"].map(k=>[k,old[k]])),updatedValues:data}},$inc:{__v:1}},{new:true,runValidators:true});if(!agent)fail(409,"Agent changed. Refresh before editing.")}
 else agent=await Agent.create({...data,agentId:await generateRecordId("agent"),createdBy:req.user._id,history:[{...entry,action:"AGENT_CREATED",updatedValues:data}]});
 res.status(req.params.id?200:201).json({success:true,data:agent,message:req.params.id?"Agent updated. Historical records preserved.":"Agent created."});
}catch(e){if(e.code===11000)return res.status(409).json({success:false,message:"Agent ID conflict. Retry creation."});next(e)}}
export async function agentProfile(req,res,next){try{
 const agent=await Agent.findById(id(req.params.id)).lean();if(!agent)fail(404,"Agent not found.");
 const accounts=await PropertyAssignment.find({$or:[{"commissionAgreement.agents.agent":String(agent._id)},{"commissionSnapshot.records.agent":String(agent._id)}]}).select("assignmentId project property client commissionAgreement").populate("project","projectName").populate("property","phaseNumber blockNumber lotNumber").populate("client","clientId firstName lastName").lean();
 const projectIds=[...new Set([...(agent.assignedProjects||[]).map(String),...accounts.map(a=>String(a.project?._id)).filter(p=>p!=="undefined")])];
 const projects=await Project.find({_id:{$in:projectIds}}).select("projectName").sort({projectName:1}).lean();res.json({success:true,data:{agent,projects,accounts}});
}catch(e){next(e)}}
async function account(req){const a=await PropertyAssignment.findById(id(req.params.id)).lean();if(!a)fail(404,"Property sale account not found.");return a}
const checkVersion=(a,req)=>{if(req.body.expectedVersion!==a.__v)fail(409,"Account changed. Reload and review before saving.");if(req.body.confirm!==true)fail(400,"Confirm the financial change before saving.")};
async function write(a,req,update,description){const merged=attachMonitoringUpdate(a,update,actor(req),description);const saved=await PropertyAssignment.findOneAndUpdate({_id:a._id,__v:a.__v??0},{...merged,$inc:{__v:1}},{new:true,runValidators:true}).lean();if(!saved)fail(409,"The account changed. Refresh and retry.");return saved}
async function commissionValues(a,body){
 if(body.clientId&&String(a.client)!==body.clientId)fail(400,"The selected buyer does not own this property sale account.");
 if(!["number","string"].includes(typeof body.termMonths)||String(body.termMonths).trim()==="")fail(400,"Enter a whole commission term in months.");const percentageBps=moneyCents(body.percentage),termMonths=Number(body.termMonths);
 if(percentageBps<=0||percentageBps>10000||!Number.isSafeInteger(termMonths)||termMonths<1||termMonths>1200||!Array.isArray(body.agents)||body.agents.length<1||body.agents.length>100)fail(400,"Choose a 0–100% allocation, positive commission term and assigned agents.");
 if(body.agents.some(r=>!r||typeof r!=="object"||typeof r.agent!=="string"))fail(400,"Choose valid assigned agents.");
 const ids=body.agents.map(r=>String(id(r.agent)));if(new Set(ids).size!==ids.length)fail(400,"An agent can only appear once in an agreement.");const agents=await Agent.find({_id:{$in:ids}}).lean();if(agents.length!==ids.length||agents.some(agent=>agent.status!=="ACTIVE"&&!a.commissionAgreement?.agents.some(old=>old.agent===String(agent._id))))fail(400,"Newly assigned agents must be active.");
 const allocations=body.agents.map((r,i)=>{const agent=agents.find(a=>String(a._id)===ids[i]),bps=moneyCents(r.percentage);if(!bps||bps>10000)fail(400,"Enter a positive agent percentage up to 100%.");return {agent:String(agent._id),agentId:agent.agentId,percentageBps:bps}});
 if(allocations.reduce((n,a)=>n+a.percentageBps,0)>percentageBps)fail(400,"Assigned agent percentages exceed the property's commission allocation.");
 return {percentageBps,termMonths,allocations,preview:previewCommission(a.contract,allocations,termMonths)};
}
function termRemovalPlan(a,term){
 if(!a.commissionAgreement||a.commissionAgreement.termMonths===term)return [];
 const current=calculateCommissions(a,allocatePayments(a)).records,history=[...current,...(a.commissionSnapshot?.records||[])];
 if(history.some(r=>r.type==='MONTHLY'&&hasCommissionHistory(a,r)))fail(409,'Term adjustment would redistribute historically linked monthly commissions. Administrator review is required; earned, paid and allocation-linked rows cannot be removed or recalculated automatically.');
 return current.filter(r=>r.type==='MONTHLY'&&r.period>term&&!hasCommissionHistory(a,r));
}
export async function deleteUnusedCommissions(req,res,next){try{const a=await account(req);checkVersion(a,req);if(!a.commissionAgreement)fail(409,"No current commission agreement. Administrator review is required.");const note=reason(req),ids=req.body.commissionIds;if(!Array.isArray(ids)||!ids.length||ids.length>100||new Set(ids).size!==ids.length)fail(400,'Choose 1–100 unique unused commission entries.');const rows=calculateCommissions(a,allocatePayments(a)).records;for(const id of ids){const row=rows.find(r=>r.commissionId===id);if(!row||!deletableCommission(a,row))fail(409,'Only zero-budget entries without earnings, allocations, payouts or financial history may be deleted. Use the term editor to adjust allocated schedule rows.')}const pruned=[...new Set([...(a.commissionAgreement?.prunedCommissionIds||[]),...ids])];const agreement={...a.commissionAgreement,prunedCommissionIds:pruned,version:(a.commissionAgreement.version||0)+1,...actor(req),reason:note};const proposed={...a,commissionAgreement:agreement};await write(proposed,req,{$set:{commissionAgreement:agreement},$push:{commissionAgreementHistory:{previousValues:a.commissionAgreement,updatedValues:agreement,...actor(req),reason:note},auditEvents:{action:'UNUSED_COMMISSION_ENTRIES_REMOVED',commissionIds:ids,reason:note,...actor(req)}}},note);res.json({success:true,message:'Unused entries removed. Financial and agreement history retained.'})}catch(e){next(e)}}
export async function previewCommissionAgreement(req,res,next){try{const a=await account(req);if(req.body.expectedVersion!==a.__v)fail(409,"Account changed. Reload before previewing commission.");const values=await commissionValues(a,req.body);res.json({success:true,data:{agents:values.preview,removedEntries:termRemovalPlan(a,values.termMonths).map(r=>({commissionId:r.commissionId,period:r.period,agentId:r.agentId})),remainingPercentageBps:values.percentageBps-values.allocations.reduce((n,r)=>n+r.percentageBps,0)}})}catch(e){next(e)}}
export async function saveCommissionAgreement(req,res,next){try{
 const a=await account(req);checkVersion(a,req);const note=reason(req),{percentageBps,termMonths,allocations}=await commissionValues(a,req.body);
 const action=req.body.agreementAction||"CREATE";
 if(!["CREATE","MODIFY"].includes(action))fail(400,"Choose create or modify agreement.");
 if(a.commissionAgreement&&action!=="MODIFY")return res.status(409).json({success:false,code:"PROPERTY_ALREADY_ASSIGNED",accountId:String(a._id),message:"Property Already Assigned. This property sale already has a commission assignment. Open Modify Existing Assignment instead."});
 if(!a.commissionAgreement&&action==="MODIFY")fail(409,"There is no existing commission assignment to modify. Reload the account.");
 const removed=termRemovalPlan(a,termMonths);if(removed.length&&req.body.confirmUnusedRemoval!==true)fail(400,'Preview and confirm removal of unused schedule entries before saving the shorter term.');
 const agreement={prunedCommissionIds:[...new Set([...(a.commissionAgreement?.prunedCommissionIds||[]),...removed.map(r=>r.commissionId)])],monthlyEarningRule:"FULL_INSTALLMENT_PERIODS",propertyBudgetCents:percentAmount(a.contract.totalCents,percentageBps),percentageBps,termMonths,agents:allocations,version:(a.commissionAgreement?.version||0)+1,contractTotalCents:a.contract.totalCents,agreedDownPaymentCents:a.contract.downPaymentCents,...actor(req),reason:note};
 const previous=a.commissionAgreement||null;const proposed={...a,commissionAgreement:agreement};
 const update={$set:{commissionAgreement:agreement},$push:{commissionAgreementHistory:{previousValues:previous,updatedValues:agreement,...actor(req),reason:note},auditEvents:{action:"COMMISSION_AGREEMENT_UPDATED",previousValues:previous,updatedValues:agreement,...actor(req),reason:note}}};
 await write(proposed,req,update,note);res.json({success:true,message:"Commission agreement saved. Existing payouts are preserved; any over-release is a recovery balance."});
}catch(e){next(e)}}
export async function commissionAccount(req,res,next){try{
 const a=await PropertyAssignment.findById(id(req.params.id)).populate("client","clientId firstName lastName").populate("project","projectName").populate("property","phaseNumber blockNumber lotNumber").lean();if(!a)fail(404,"Account not found.");const snapshot=calculateCommissions(a,allocatePayments(a));res.json({success:true,data:{_id:a._id,__v:a.__v,assignmentId:a.assignmentId,client:a.client,project:a.project,property:a.property,contract:a.contract,agreement:a.commissionAgreement,snapshot,payouts:(a.commissionPayouts||[]).map(effectivePayout),recoveries:a.commissionRecoveries||[],history:a.commissionEvents||[],agreementHistory:a.commissionAgreementHistory||[]}});
}catch(e){next(e)}}
export async function releaseCommission(req,res,next){try{
 const a=await account(req),requestId=key(req.body.requestId),amountCents=moneyCents(req.body.amount),releaseDate=req.body.releaseDate,note=reason(req);
 const old=a.commissionPayouts?.find(p=>p.requestId===requestId);if(old){if(String(old.voucherId||'')!==String(req.body.voucherId||'')||String(old.voucherEntryId||'')!==String(req.body.voucherEntryId||'')||old.commissionId!==req.body.commissionId||old.amountCents!==amountCents||old.releaseDate!==releaseDate||old.method!==req.body.method||physicalFunding(old.method,old.fundingAccount)!==physicalFunding(req.body.method,req.body.fundingAccount)||old.reference!==String(req.body.reference||"").trim())fail(409,"This submission ID belongs to a different payout.");await finalizeVoucher(old);return res.json({success:true,data:old,message:"Payout already recorded. No duplicate created."})}
 checkVersion(a,req);const snapshot=calculateCommissions(a,allocatePayments(a)),record=snapshot.records.find(r=>r.commissionId===req.body.commissionId);
 if(!record||!amountCents||amountCents>record.unreleasedCents)fail(409,"Payout exceeds earned, unreleased commission.");if(snapshot.records.some(r=>r.recoveryDueCents>0))fail(409,"Resolve or record recovery of over-released commissions on this sale before another payout.");
 if(!validDate(releaseDate)||releaseDate>today()||releaseDate<(record.firstEarnedAt||record.earningDate)||!METHODS.includes(req.body.method))fail(400,"Choose an actual release date on/after first earning, not in the future, and a valid payout method.");
 const historical=calculateCommissions(a,allocatePayments(a,releaseDate),{asOf:releaseDate}).records.find(r=>r.commissionId===record.commissionId);if(!historical||amountCents>historical.unreleasedCents)fail(409,"The buyer had not funded enough earned commission by the selected release date.");
 const payout={fundingAccount:validateFunding(req.body.method,req.body.fundingAccount),payoutId:await generateRecordId("commissionPayout"),requestId,commissionId:record.commissionId,agent:record.agent,agentId:record.agentId,type:record.type,period:record.period,earnedCentsAtRelease:record.earnedCents,amountCents,releaseDate,method:req.body.method,reference:String(req.body.reference||"").trim().slice(0,160),notes:String(req.body.notes||"").trim().slice(0,500),...actor(req),reason:note};
 Object.assign(payout,await lockVoucher(req,a,record,amountCents)||{});
 const proposed={...a,commissionPayouts:[...(a.commissionPayouts||[]),payout]};await write(proposed,req,{$push:{commissionPayouts:payout,auditEvents:{action:"COMMISSION_RELEASED",previousValues:record,updatedValues:payout,...actor(req),reason:note}}},note);await finalizeVoucher(payout);res.status(201).json({success:true,data:payout,message:"Actual commission payout recorded."});
}catch(e){next(e)}}
export async function recoverCommission(req,res,next){try{
 const a=await account(req),requestId=key(req.body.requestId),amountCents=moneyCents(req.body.amount),note=reason(req);const old=a.commissionRecoveries?.find(p=>p.requestId===requestId);if(old){if(old.commissionId!==req.body.commissionId||old.amountCents!==amountCents||old.method!==req.body.method||old.recoveryDate!==req.body.recoveryDate||physicalFunding(old.method,old.fundingAccount)!==physicalFunding(req.body.method,req.body.fundingAccount))fail(409,"Submission ID already used.");return res.json({success:true,message:"Recovery already recorded."})}checkVersion(a,req);
 const record=calculateCommissions(a,allocatePayments(a)).records.find(r=>r.commissionId===req.body.commissionId);if(!record||!amountCents||amountCents>record.recoveryDueCents||!validDate(req.body.recoveryDate)||req.body.recoveryDate>today()||req.body.recoveryDate<(record.latestReleaseDate||a.contract.contractDate)||!METHODS.includes(req.body.method))fail(400,"Enter an actual recovery within the recovery balance, with valid date/method.");
 const recovery={fundingAccount:validateFunding(req.body.method,req.body.fundingAccount),requestId,commissionId:record.commissionId,agent:record.agent,amountCents,recoveryDate:req.body.recoveryDate,method:req.body.method,reference:String(req.body.reference||"").slice(0,160),...actor(req),reason:note};await write({...a,commissionRecoveries:[...(a.commissionRecoveries||[]),recovery]},req,{$push:{commissionRecoveries:recovery,auditEvents:{action:"COMMISSION_RECOVERED",previousValues:record,updatedValues:recovery,...actor(req),reason:note}}},note);res.json({success:true,message:"Actual recovery recorded; payout history preserved."});
}catch(e){next(e)}}
export async function correctPayout(req,res,next){try{
 const a=await account(req);checkVersion(a,req);const note=reason(req),payout=a.commissionPayouts?.find(p=>p.payoutId===req.params.payoutId);if(!payout)fail(404,"Payout not found.");if(req.body.baseRevision!==(payout.revisions?.length||0))fail(409,"Payout changed. Reload before correcting.");
 const old=effectivePayout(payout),amountCents=moneyCents(req.body.amount),values={fundingAccount:validateFunding(req.body.method,req.body.fundingAccount||(req.body.method===old.method?old.fundingAccount:null),req.body.method===old.method&&!req.body.fundingAccount&&!old.fundingAccount),amountCents,releaseDate:req.body.releaseDate,method:req.body.method,reference:String(req.body.reference||"").trim().slice(0,160),notes:String(req.body.notes||"").trim().slice(0,500),voided:req.body.voided===true};if(!amountCents||!validDate(values.releaseDate)||values.releaseDate>today()||values.releaseDate<a.contract.contractDate||!METHODS.includes(values.method))fail(400,"Check the corrected amount, actual date and method.");
 await validateVoucherCorrection(a,payout,values);
 const atDateAccount={...a,commissionPayouts:a.commissionPayouts.filter(p=>p.payoutId!==payout.payoutId)};
 const historical=calculateCommissions(atDateAccount,allocatePayments(a,values.releaseDate),{asOf:values.releaseDate}).records.find(r=>r.commissionId===payout.commissionId);
 if(!values.voided&&(!historical||amountCents>historical.unreleasedCents))fail(409,"Corrected payout exceeds commission earned by its actual release date.");
 const before=calculateCommissions(a,allocatePayments(a));const revision={values,previousValues:Object.fromEntries(["fundingAccount","payoutId","amountCents","releaseDate","method","reference","notes","voided"].map(k=>[k,old[k]])),...actor(req),reason:note};const proposed={...a,commissionPayouts:a.commissionPayouts.map(p=>p.payoutId===payout.payoutId?{...p,revisions:[...(p.revisions||[]),revision]}:p)};const after=calculateCommissions(proposed,allocatePayments(proposed));if(after.records.some(r=>r.recoveryDueCents>(before.records.find(b=>b.commissionId===r.commissionId)?.recoveryDueCents||0)))fail(409,"Correction would create an over-release. Reduce/void the payout or review buyer payments.");if(after.records.some(r=>r.netReleasedCents<0))fail(409,"This payout already has a recorded recovery. Reconcile the recovery before reducing it.");
 const update={$push:{"commissionPayouts.$[p].revisions":revision,auditEvents:{action:"COMMISSION_PAYOUT_CORRECTED",previousValues:old,updatedValues:values,...actor(req),reason:note}}};const merged=attachMonitoringUpdate(proposed,update,actor(req),note);const saved=await PropertyAssignment.findOneAndUpdate({_id:a._id,__v:a.__v},{...merged,$inc:{__v:1}},{new:true,runValidators:true,arrayFilters:[{"p.payoutId":payout.payoutId}]}).lean();if(!saved)fail(409,"Account changed. Refresh before correcting.");res.json({success:true,message:"Payout correction appended. Original payout preserved."});
}catch(e){next(e)}}
export function commissionPipeline(query){
 const match={};if(query.agent)match.agent=String(id(query.agent));if(query.project)match.project=id(query.project);if(query.property)match.property=id(query.property);if(query.client)match.client=id(query.client);if(query.account)match.accountId=id(query.account);
 if(query.type){if(!["DP","MONTHLY"].includes(query.type))fail(400,"Invalid commission type.");match.type=query.type}
 if(query.status){if(query.status==="UNRELEASED")match.unreleasedCents={$gt:0};else if(["RELEASED","PARTIALLY_RELEASED","AWAITING_BUYER_PAYMENT","ADJUSTED_REVERSED"].includes(query.status))match.status=query.status;else fail(400,"Invalid commission status.")}
 if(query.from||query.to){if(!validDate(query.from)||!validDate(query.to)||query.from>query.to)fail(400,"Choose valid date bounds.");match.earningDate={$gte:query.from,$lte:query.to}}
 const pipeline=[{$match:{"commissionSnapshot.records.0":{$exists:true}}},{$unwind:"$commissionSnapshot.records"},{$replaceWith:{$mergeObjects:["$commissionSnapshot.records",{accountId:"$_id",assignmentId:"$assignmentId",propertyBudgetCents:"$commissionAgreement.propertyBudgetCents",project:"$project",property:"$property",client:"$client"}]}},{$match:match}];
 for(const [field,collection,local]of [["agentInfo","agents","agent"],["projectInfo","projects","project"],["propertyInfo","properties","property"],["clientInfo","clients","client"]]){
  if(local==="agent")pipeline.push({$addFields:{agentObjectId:{$convert:{input:"$agent",to:"objectId",onError:null,onNull:null}}}});
  pipeline.push({$lookup:{from:collection,localField:local==="agent"?"agentObjectId":local,foreignField:"_id",as:field,pipeline:[{$project:field==="agentInfo"?{agentId:1,fullName:1}:field==="projectInfo"?{projectName:1}:field==="propertyInfo"?{phaseNumber:1,blockNumber:1,lotNumber:1}:{clientId:1,firstName:1,lastName:1}}]}},{$set:{[field]:{$arrayElemAt:[`$${field}`,0]}}});
 }
 if(query.q)pipeline.push({$match:{$or:["commissionId","agentInfo.fullName","agentInfo.agentId","projectInfo.projectName","clientInfo.clientId","clientInfo.firstName","clientInfo.lastName"].map(k=>({[k]:{$regex:escaped(query.q),$options:"i"}}))}});
 return pipeline;
}
export async function listCommissions(req,res,next){try{
 const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page)||1)),sort=["earningDate","earnedCents","unreleasedCents","latestReleaseDate"].includes(req.query.sort)?req.query.sort:"sequence",direction=req.query.direction==="asc"?1:-1;
 const totals=Object.fromEntries(["budgetCents","earnedCents","releasedCents","recoveredCents","unreleasedCents","awaitingCents","recoveryDueCents"].map(k=>[k,{$sum:`$${k}`}])) ;
 const summaryGroup={_id:null,...totals,pendingReleases:{$sum:{$cond:[{$gt:["$unreleasedCents",0]},1,0]}}};
 const [data]=await PropertyAssignment.aggregate([...commissionPipeline(req.query),{$sort:sort==="sequence"?{accountId:1,agent:1,period:1,commissionId:1}:{[sort]:direction,commissionId:1}},{$facet:{rows:req.listExport?[]:[{$skip:(page-1)*20},{$limit:20}],total:[{$count:"count"}],summary:[{$group:summaryGroup}],budgets:[{$group:{_id:"$accountId",budget:{$first:"$propertyBudgetCents"}}},{$group:{_id:null,budget:{$sum:"$budget"}}}]}}]);
 const summary={...(data?.summary[0]||{}),propertyBudgetCents:data?.budgets[0]?.budget||0};
 if(Object.entries(summary).some(([k,v])=>k!=="_id"&&!Number.isSafeInteger(v)))fail(409,"Commission summary exceeds supported centavo precision.");
 res.json({success:true,data:{rows:data?.rows||[],total:data?.total[0]?.count||0,summary,page,pageSize:20}});
}catch(e){next(e)}}
