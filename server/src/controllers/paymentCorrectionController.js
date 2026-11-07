import {validateFunding,physicalFunding} from "../utils/fundingAccount.js";
import {validateReceipt,checkReceipt,receiptScope} from "../services/receiptService.js";
import {generateRecordId} from "../utils/generateRecordId.js";
import {attachMonitoringUpdate} from "../services/monitoringService.js";
import {allocationPreview} from "../utils/allocationPreview.js";
import mongoose from "mongoose";
import PropertyAssignment from "../models/PropertyAssignment.js";
import { effectivePayment, allocatePayments } from "../utils/paymentLedger.js";
import { moneyCents, validDate, today, METHODS, summarizeAccount } from "../utils/accounting.js";
const fail=(code,message)=>{throw Object.assign(new Error(message),{statusCode:code})};
export const paymentValues=p=>Object.fromEntries(["fundingAccount","receiptNumber","configuration","amountCents","paymentDate","method","reference","notes","type","voided","allocationPlan"].map(k=>[k,p[k]??(k==="type"?"AUTO":k==="allocationPlan"?[]:k==="voided"?false:"")]));
const notification=(request,status,recipient)=>({id:`${request.requestId}:${status}:${recipient}`,requestId:request.requestId,recipient,status,message:`Payment ${request.paymentId}: ${status.toLowerCase().replaceAll("_"," ")}`,createdAt:new Date(),readBy:[]});
async function load(req){
 if(!mongoose.isValidObjectId(req.params.id))fail(400,"Invalid account.");
 const account=await PropertyAssignment.findById(req.params.id).lean();if(!account)fail(404,"Account not found.");
 return account;
}
function actor(req){return {userId:req.user._id,username:req.user.username,role:req.user.role,timestamp:new Date()}}
async function save(account,req,action,before) {
 const event={...actor(req),eventId:req.auditEvent?._id,action,previousValues:before,updatedValues:summarizeAccount(account)};
 const paymentId=req.params.paymentId||account.correctionRequests?.find(r=>r.requestId===req.params.requestId)?.paymentId;
 const target=account.payments.find(p=>p.paymentId===paymentId),oldRevision=before.payments.find(p=>p.paymentId===paymentId)?.revision||0;
 const ledgerPush=target?.revisions?.length>oldRevision?{"payments.$[ledgerPayment].revisions":{$each:target.revisions.slice(oldRevision)}}:{};
 const update=attachMonitoringUpdate(account,{$set:{correctionRequests:account.correctionRequests||[],notifications:account.notifications||[]},$push:{...ledgerPush,auditEvents:event},$inc:{__v:1}},actor(req),String(req.body.reason||action));
 const options={new:true,runValidators:true,...(Object.keys(ledgerPush).length?{arrayFilters:[{"ledgerPayment.paymentId":paymentId}]}:{})};
 const updated=await PropertyAssignment.findOneAndUpdate({_id:account._id,__v:account.__v??0},update,options).lean();
 if(!updated)fail(409,"The account changed. Refresh and review before retrying.");
 req.auditDetails={action,...actor(req)};
}
function revision(account,payment,values,reason,req,requestId){
 const proposed=structuredClone(account);
 const target=proposed.payments.find(p=>p.paymentId===payment.paymentId);
 target.revisions=[...(target.revisions||[]),{values,previousValues:paymentValues(effectivePayment(payment)),reason,requestId,signature:req.correctionSignature,...actor(req)}];
 allocatePayments(proposed); // validate total and typed allocations before any write
 const last=target.revisions.at(-1);last.previousAllocations=allocatePayments(account).allocations[payment.paymentId]||[];last.correctedAllocations=allocatePayments(proposed).allocations[payment.paymentId]||[];
 payment.revisions=target.revisions;
}
export async function correctPayment(req,res,next){
 try{
  const account=await load(req),payment=account.payments.find(p=>p.paymentId===req.params.paymentId);
  if(!payment)fail(404,"Payment not found.");
  const requestId=req.body.requestId;
  if(typeof requestId!=="string"||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))fail(400,"Invalid submission ID.");
  if(req.body.allocationPlan!==undefined&&(!Array.isArray(req.body.allocationPlan)||req.body.allocationPlan.length>1200))fail(400,"Invalid allocation plan.");
  if(req.body.allocationPlan?.some(row=>!row||typeof row!=="object"||(row.target!==undefined&&typeof row.target!=="string")))fail(400,"Invalid allocation target.");
  const allocationPlan=req.body.allocationPlan===undefined?(effectivePayment(payment).allocationPlan||[]):req.body.allocationPlan.map(row=>({...((typeof row.target==="string"&&row.target.startsWith("P:")||row.assessmentId)?{assessmentId:row.assessmentId||row.target.slice(2)}:{installmentId:row.target||row.installmentId}),amountCents:row.amount!==undefined?moneyCents(row.amount):row.amountCents}));
  req.correctionSignature=JSON.stringify([moneyCents(req.body.amount),req.body.paymentDate,req.body.method,req.body.type||"AUTO",String(req.body.notes||"").trim().slice(0,500),String(req.body.reason||"").trim(),req.body.voided===true,req.body.baseRevision,allocationPlan,req.body.receiptNumber??effectivePayment(payment).receiptNumber,physicalFunding(req.body.method,req.body.fundingAccount||(req.body.method===effectivePayment(payment).method?effectivePayment(payment).fundingAccount:null))]);
  account.correctionRequests ||= [];account.notifications ||= [];
  const repeated=account.correctionRequests.find(r=>r.requestId===requestId);
  if(repeated){if(repeated.signature!==req.correctionSignature || String(repeated.requestedBy)!==String(req.user._id))fail(409,"Submission ID already used.");return res.json({success:true,data:repeated,message:"Request already saved. No duplicate created."})}
  const previousRevision=payment.revisions?.find(r=>r.requestId===requestId);
  if(previousRevision){if(previousRevision.signature!==req.correctionSignature)fail(409,"Submission ID already used for a different correction.");return res.json({success:true,message:"Correction already saved. No duplicate created."})}
  const current=effectivePayment(payment),reason=String(req.body.reason||"").trim();
  if(reason.length<5||reason.length>500)fail(400,"Enter a correction reason (5–500 characters).");
  if(req.body.baseRevision!==current.revision)fail(409,"Payment changed. Refresh before correcting.");
  if(current.status==="VOIDED")fail(409,"A voided payment cannot be edited.");
  const values={...paymentValues(current),fundingAccount:validateFunding(req.body.method,req.body.fundingAccount||(req.body.method===current.method?current.fundingAccount:null),req.body.method===current.method&&!req.body.fundingAccount&&!current.fundingAccount),receiptNumber:req.body.receiptNumber===undefined||(!req.body.receiptNumber&&!current.receiptNumber)?current.receiptNumber:validateReceipt(req.body.receiptNumber),allocationPlan,amountCents:moneyCents(req.body.amount),paymentDate:req.body.paymentDate,method:req.body.method,notes:String(req.body.notes||"").trim().slice(0,500),type:req.body.type||"AUTO",voided:req.body.voided===true};
  if(!values.amountCents||!validDate(values.paymentDate)||values.paymentDate<account.contract.contractDate||values.paymentDate>today()||!METHODS.includes(values.method)||!["AUTO","DOWN_PAYMENT","INSTALLMENT","PENALTY"].includes(values.type))fail(400,"Enter a valid amount, date, method and payment type.");
  if(values.receiptNumber&&values.receiptNumber!==current.receiptNumber)await checkReceipt(values.receiptNumber,payment.receiptScope||receiptScope(),account._id,payment.paymentId,requestId);
  const before=summarizeAccount(account),copy=structuredClone(account),copyPayment=copy.payments.find(p=>p.paymentId===payment.paymentId);
  revision(copy,copyPayment,values,reason,req,requestId);
  const preview=allocationPreview(account,copy,payment.paymentId);
  if(req.path?.endsWith("/preview"))return res.json({success:true,data:preview});
  if(account.contract.monitoringTerms&&req.body.previewToken!==preview.token)fail(409,"Refresh and confirm the correction allocation preview.");
  if(req.user.role==="ADMIN"){
   if(req.body.confirm!==true)fail(400,"Confirm the payment correction before saving.");
   if(values.receiptNumber&&values.receiptNumber!==current.receiptNumber)await checkReceipt(values.receiptNumber,payment.receiptScope||receiptScope(),account._id,payment.paymentId,requestId,true);
   revision(account,payment,values,reason,req,requestId);
   for(const pending of account.correctionRequests.filter(r=>r.paymentId===payment.paymentId&&r.status==="PENDING")){
    pending.status="STALE";pending.decisionReason="An administrator changed the original payment.";pending.decidedBy=req.user._id;pending.decidedAt=new Date();account.notifications.push(notification(pending,"STALE",String(pending.requestedBy)));
   }
   await save(account,req,"PAYMENT_CORRECTED",before);
   return res.json({success:true,message:"Payment corrected. Original values and IDs preserved."});
  }
  if(account.correctionRequests.some(r=>r.paymentId===payment.paymentId&&r.status==="PENDING"))fail(409,"A pending correction already exists for this payment.");
  const request={requestNumber:await generateRecordId("request"),signature:req.correctionSignature,requestId,paymentId:payment.paymentId,baseRevision:current.revision,originalValues:paymentValues(current),originalAllocations:allocatePayments(account).allocations[payment.paymentId],proposedAllocations:preview.allocations,values,reason,requestedBy:req.user._id,requestedUsername:req.user.username,requestedAt:new Date(),status:"PENDING"};
  account.correctionRequests.push(request);account.notifications.push(notification(request,"PENDING","ADMIN"));
  await save(account,req,"PAYMENT_CORRECTION_REQUESTED",before);
  res.status(201).json({success:true,data:request,message:"Correction sent for approval. Original payment is unchanged."});
 }catch(e){next(e)}
}
export async function listApprovalRequests(req,res,next){
 try{
  const filter=req.user.role==="ADMIN"?{"correctionRequests.0":{$exists:true}}:{"correctionRequests.requestedBy":req.user._id};
  const accounts=await PropertyAssignment.find(filter).select("assignmentId correctionRequests").lean();
  const rows=accounts.flatMap(a=>(a.correctionRequests||[]).filter(r=>req.user.role==="ADMIN"||String(r.requestedBy)===String(req.user._id)).map(r=>({...r,accountId:a._id,assignmentId:a.assignmentId}))).sort((a,b)=>new Date(b.requestedAt)-new Date(a.requestedAt));
  res.json({success:true,data:rows});
 }catch(e){next(e)}
}
export async function decideCorrection(req,res,next){
 try{
  const account=await load(req),request=account.correctionRequests?.find(r=>r.requestId===req.params.requestId);
  if(!request)fail(404,"Correction request not found.");
  if(request.status!=="PENDING")return res.json({success:true,data:request,message:`Request is already ${request.status.toLowerCase()}. No payment changed.`});
  if(!["APPROVED","REJECTED"].includes(req.body.decision)||req.body.confirm!==true)fail(400,"Confirm an approval or rejection.");
  const reason=String(req.body.reason||"").trim().slice(0,500);
  if(req.body.decision==="REJECTED"&&reason.length<5)fail(400,"Enter a rejection reason (at least 5 characters).");
  const before=summarizeAccount(account),payment=account.payments.find(p=>p.paymentId===request.paymentId),current=payment&&effectivePayment(payment);
  let status=req.body.decision,decisionReason=reason;
  if(status==="APPROVED"){
   if(!current||current.revision!==request.baseRevision||JSON.stringify(paymentValues(current))!==JSON.stringify(request.originalValues)){status="STALE";decisionReason="The original payment changed. Submit a new correction."}
   else {try{
    const copy=structuredClone(account),candidate=copy.payments.find(p=>p.paymentId===payment.paymentId),reviewReq={...req,correctionSignature:request.signature};
    revision(copy,candidate,request.values,request.reason,reviewReq,request.requestId);
    if(JSON.stringify(candidate.revisions.at(-1).correctedAllocations)!==JSON.stringify(request.proposedAllocations)){status="STALE";decisionReason="The schedule or allocation priority changed. Submit a new allocation preview."}
    else {if(request.values.receiptNumber&&request.values.receiptNumber!==current.receiptNumber)await checkReceipt(request.values.receiptNumber,payment.receiptScope||receiptScope(),account._id,payment.paymentId,request.requestId,true);revision(account,payment,request.values,request.reason,reviewReq,request.requestId)}
   }catch(e){if(e.statusCode!==409)throw e;status="STALE";decisionReason=e.message}}
  }
  Object.assign(request,{status,decisionReason,decidedAt:new Date(),decidedBy:req.user._id,decidedUsername:req.user.username});
  account.notifications ||= [];account.notifications.push(notification(request,status,String(request.requestedBy)));
  await save(account,req,`PAYMENT_CORRECTION_${status}`,before);
  res.json({success:true,data:request,message:`Correction ${status.toLowerCase()}.`});
 }catch(e){next(e)}
}
