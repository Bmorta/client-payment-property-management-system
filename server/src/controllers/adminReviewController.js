import mongoose from 'mongoose';
import Cancellation from '../models/CancellationCase.js';
import Account from '../models/PropertyAssignment.js';
import {reviewActor} from '../utils/auditValues.js';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
export async function resolveForfeitedCancellation(req,res,next){let session;try{
 if(req.user?.role!=='ADMIN')fail('Administrator access is required.',403);
 const caseId=req.params.caseId;if(!mongoose.isValidObjectId(caseId))fail('Choose a valid cancellation review.',400);
 const action=req.body?.action==='DELETE'?'DELETE':'REJECT';
 const reason=String(req.body?.reason||'').trim();if(reason.length<5||reason.length>500)fail('Enter a reason of 5–500 characters.',400);
 session=await mongoose.startSession();let result;
 await session.withTransaction(async()=>{
  const c=await Cancellation.findById(caseId).session(session);if(!c)fail('Cancellation review not found.',404);
  if(['CANCELLED','ARCHIVED'].includes(c.status)&&c.resolution?.action===action&&c.resolution?.reason===reason){result=c;return;}
  if(c.status!=='APPROVED_PENDING'||c.agreement?.status==='FINALIZED')fail('Only an unfinalized pending cancellation review can be withdrawn.',409);
  const accounts=await Account.find({_id:{$in:c.sourceIds}}).session(session);
  if(accounts.length!==c.sourceIds.length||accounts.some(a=>a.lifecycle!=='FORFEITED'))fail('This action is only for cancellation reviews whose every linked contract is already forfeited.',409);
  const now=new Date(),actor=reviewActor(req.user),event={action:action==='DELETE'?'CANCELLATION_REVIEW_ARCHIVED_AFTER_FORFEITURE':'CANCELLATION_REJECTED_AFTER_FORFEITURE',...actor,reason,timestamp:now,caseId:c.caseId},requester=c.requestedBy||c.approvedBy,recipient=String(requester?.userId||'');
  for(const a of accounts){
   const update={$push:{auditEvents:event},$inc:{__v:1}};
   if(a.pendingCancellation?.caseId===c.caseId){update.$unset={pendingCancellation:1};update.$set={notifications:(a.notifications||[]).filter(n=>n.id!==c.caseId+':pending:'+a._id)};}
   if(recipient){update.$push.notifications={id:`cancellation-rejected:${c._id}:${recipient}`,recipient,eventOnly:true,status:action==='DELETE'?'CANCELLATION_REVIEW_ARCHIVED':'CANCELLATION_REJECTED',message:action==='DELETE'?`Cancellation request ${c.caseId} was archived after forfeiture. Reason: ${reason}`:`Cancellation request ${c.caseId} was rejected because the contract was already forfeited. Reason: ${reason}`,href:'/approval-requests?status=HISTORY&category=cancellation',createdAt:now,readBy:[]};}
   const saved=await Account.updateOne({_id:a._id,__v:a.__v,lifecycle:'FORFEITED'},update,{session});if(!saved.modifiedCount)fail('A forfeited contract changed during review. Refresh and retry.',409);
  }
  c.status=action==='DELETE'?'ARCHIVED':'CANCELLED';c.resolution={action, ...actor,reason,timestamp:now,reasonCode:'CONTRACT_ALREADY_FORFEITED'};if(action==='DELETE')c.deletion=c.resolution;else{c.withdrawal=c.resolution;c.rejection=c.resolution;}c.history.push(event);await c.save({session});result=c;
 });res.json({success:true,data:{caseId:result.caseId,status:result.status},message:`Cancellation review ${action==='DELETE'?'archived':'rejected'} and requester notified. Forfeiture status, property restriction, payments, refunds and commission history were preserved.`});
 }catch(e){next(e)}finally{await session?.endSession()}}
