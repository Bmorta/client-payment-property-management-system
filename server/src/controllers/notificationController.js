import Reservation from '../models/Reservation.js';
import {addDays} from '../services/reservationService.js';
import {today} from '../utils/accounting.js';
import {attentionItems} from '../../../shared/sidebarUnseen.js';
import {notificationAttention} from '../../../shared/sidebarAttention.js';
import {groupNotifications} from '../services/notificationGrouping.js';
import Agent from '../models/Agent.js';
import SiteRequest from '../models/SiteRequest.js';
import {requestFlags,requestActivityLabel} from '../../../shared/siteRequests.js';
import {createHash} from "node:crypto";
import mongoose from "mongoose";
import PropertyAssignment from "../models/PropertyAssignment.js";
import NotificationRead from "../models/NotificationRead.js";
import User from "../models/User.js";
import {verifyAccessToken} from "../utils/jwt.js";
const visible=(n,user)=>n.recipient===String(user._id)||(["ADMIN","STAFF"].includes(n.recipient)&&user.role===n.recipient);
const readKey=(user,account,id)=>createHash('sha256').update(JSON.stringify([String(user),String(account),id])).digest('hex');
async function visibleRows(user){
 let query=PropertyAssignment.find({notifications:{$elemMatch:{recipient:{$in:[String(user._id),...(["ADMIN","STAFF"].includes(user.role)?[user.role]:[])]}}}}).select("notifications __v client assignmentId monitoring.schedule monitoring.outstandingPenaltyCents correctionRequests commissionSnapshot.records");
 if(query.populate)query=query.populate("client","firstName middleName lastName suffix clientId");
 let accounts=await query.lean();
 const requests=await SiteRequest.find(user.role==='ADMIN'?{}:{$or:[{createdBy:user._id},{personnel:user._id},{'notifications.recipient':String(user._id)}]}).select('requestId createdBy personnel status schedule reports followUp notifications __v preferredStart contact requestingAgent requestingAgentName history updatedAt').lean();
 const reminders=requests.filter(r=>r.status!=='DELETED').map(r=>{const flags=requestFlags(r),recipients=[...new Set(['ADMIN',String(r.createdBy),...(r.personnel||[]).map(String)])],dynamic=Object.entries(flags).filter(([kind,on])=>on&&kind!=='today').flatMap(([kind])=>recipients.map(recipient=>({id:'site-reminder-'+kind+'-'+r._id+'-'+(r.followUp?.dueAt||r.schedule?.start||'')+'-'+recipient,recipient,eventOnly:true,siteReminder:true,status:kind.toUpperCase(),message:r.requestId+': '+kind.replaceAll('followUp','follow-up required'),href:'/site-requests?request='+r._id,createdAt:r.schedule?.end||r.preferredStart||r.followUp?.dueAt||new Date(0),readBy:[]})));return {...r,flags,sourceModel:'SiteRequest',notifications:[...(r.notifications||[]),...dynamic]}});
 const day=today(),attentionHolds=user.role==='ADMIN'||user.role==='STAFF'
  ?await Reservation.find({held:true,expiresOn:{$lte:addDays(day,2)},...(user.role==='STAFF'?{'payment.createdBy':user._id}:{})})
    .select('client expiresOn history').populate('client','firstName lastName').lean():[];
 const reservationAlerts=attentionHolds.map(row=>{const expired=row.expiresOn<day;return {...row,sourceModel:'Reservation',notifications:[{
   id:(expired?'expired':'expiring')+'-reservation-'+row._id+'-'+row.expiresOn,recipient:String(user._id),eventOnly:true,
   status:expired?'RESERVATION_REVIEW':'RESERVATION_EXPIRING',
   message:expired?'Paid reservation expired and needs review. The lot is still on hold.':`Paid reservation expires on ${row.expiresOn}.`,
   href:'/reservations?reservationStatus='+(expired?'expired':'week'),
   createdAt:row.history.findLast(e=>e.action==='EXPIRED')?.timestamp||new Date(expired?row.expiresOn+'T16:00:00Z':addDays(row.expiresOn,-3)+'T16:00:00Z')
 }]};});
 accounts=[...accounts.map(a=>({...a,sourceModel:'PropertyAssignment'})),...reminders,...reservationAlerts];
 const agentIds=[...new Set(accounts.flatMap(a=>(a.notifications||[]).filter(n=>n.commissionAlert&&visible(n,user)).map(n=>{try{return new URL(n.href,'http://rems.local').searchParams.get('agent')}catch{return null}})).filter(id=>mongoose.isValidObjectId(id)))];
 const agents=agentIds.length?await Agent.find({_id:{$in:agentIds}}).select('fullName').lean():[],agentNames=new Map(agents.map(a=>[String(a._id),a.fullName]));
 const reads=await NotificationRead.find({user:user._id,account:{$in:accounts.map(a=>a._id)}}).select('_id').lean(),keys=new Set(reads.map(r=>r._id));
 const rows=accounts.flatMap(a=>(a.notifications||[]).map((n,index)=>({...n,id:n.id||'legacy-'+createHash('sha256').update(JSON.stringify([String(a._id),index,n.createdAt,n.message,n.recipient])).digest('hex')})).filter(n=>visible(n,user)).map(n=>({...n,accountId:a._id,sourceModel:a.sourceModel,readIdentity:n.notificationRevision?n.id+':'+n.notificationRevision:n.id,requestStatus:a.status,requestUpdatedAt:a.updatedAt,requestFlags:a.sourceModel==='SiteRequest'?requestFlags(a):undefined,requestHistory:a.sourceModel==='SiteRequest'?(a.history||[]).map(e=>({timestamp:e.timestamp,action:requestActivityLabel(e),username:e.username,reason:/^Reason for activity or decision\s*\*?$/i.test(e.reason||'')?'':e.reason})):undefined,clientIdentity:a.client?String(a.client._id||a.client):null,subjectName:a.contact?.name||(a.client&&[a.client.firstName,a.client.middleName,a.client.lastName,a.client.suffix].filter(Boolean).join(' '))||a.assignmentId||a.requestId,monitoringSchedule:a.monitoring?.schedule||[],outstandingPenaltyCents:a.monitoring?.outstandingPenaltyCents||0,read:(n.readBy||[]).includes(String(user._id))||keys.has(readKey(user._id,a._id,n.notificationRevision?n.id+':'+n.notificationRevision:n.id))}))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||String(a.id).localeCompare(String(b.id)));
 for(const n of rows)if(n.commissionAlert){try{n.agentIdentity=new URL(n.href,'http://rems.local').searchParams.get('agent');n.subjectName=agentNames.get(n.agentIdentity)||n.subjectName}catch{}}
 const unique=[...new Map(rows.slice().reverse().map(n=>[`${n.sourceModel}:${n.accountId}:${n.id}`,n])).values()];
 return {accounts,reads,rows:unique};
}
export async function notificationData(user,{page=1,limit=100,q=''}={}){
 const {accounts,reads,rows:raw}=await visibleRows(user),rows=groupNotifications(raw),filtered=q?rows.filter(n=>[n.title,n.summary,n.message,...(n.details||[]).map(d=>d.message)].join(' ').toLowerCase().includes(q.toLowerCase())):rows;
 return {attention:{...notificationAttention(accounts,raw,user),items:attentionItems(accounts,raw,user)},version:createHash('sha256').update(JSON.stringify([accounts.map(a=>`${a._id}:${a.__v||0}`).sort(),reads.map(r=>r._id).sort(),rows.map(n=>[n.id,n.read,n.summary,n.count])])).digest('hex'),rows:filtered.slice((page-1)*limit,page*limit),total:filtered.length,page,pageSize:limit,unread:rows.filter(n=>!n.read&&(!n.monitoringAlert||n.active!==false||n.eventOnly)).length};
}
export async function listNotifications(req,res,next){try{
 const page=Number(req.query.page||1),limit=Number(req.query.limit||100),q=String(req.query.q||'').trim().slice(0,100);
 if(!Number.isSafeInteger(page)||page<1||page>100000||![10,25,50,100].includes(limit))return res.status(400).json({success:false,message:'Choose valid notification pagination.'});
 res.json({success:true,data:await notificationData(req.user,{page,limit,q})});
}catch(e){next(e)}}
export async function readNotifications(req,res,next){try{
 const accountId=req.body?.accountId;if(accountId&&!mongoose.isValidObjectId(accountId))return res.status(400).json({success:false,message:'Invalid notification account.'});
 const {rows}=await visibleRows(req.user),group=req.params.notificationId?.startsWith('group-')?groupNotifications(rows).find(n=>n.id===req.params.notificationId):null,memberKeys=new Set((group?.details||[]).map(n=>`${n.accountId}:${n.id}`)),matching=rows.filter(n=>(!req.params.notificationId||n.id===req.params.notificationId||memberKeys.has(`${n.accountId}:${n.id}`))&&(!accountId||group||String(n.accountId)===accountId));
 if(req.params.notificationId&&!matching.length)return res.status(404).json({success:false,message:'Notification not found or not available to your role.'});
 if(req.params.notificationId&&!group&&!accountId&&new Set(matching.map(n=>String(n.accountId))).size>1)return res.status(400).json({success:false,message:'Select the specific account notification before marking it read.'});
 const observed=Array.isArray(req.body?.members)?new Set(req.body.members.filter(m=>m&&typeof m.id==='string'&&typeof m.accountId==='string'&&typeof m.readIdentity==='string').map(m=>`${m.accountId}:${m.id}:${m.readIdentity}`)):null;
 const operations=matching.filter(n=>!n.read&&(!observed||observed.has(`${n.accountId}:${n.id}:${n.readIdentity||n.id}`))).map(n=>({updateOne:{filter:{_id:readKey(req.user._id,n.accountId,n.readIdentity||n.id)},update:{$setOnInsert:{user:req.user._id,account:n.accountId,notificationId:n.readIdentity||n.id,sourceModel:n.sourceModel,readAt:new Date()}},upsert:true}}));
 for(let i=0;i<operations.length;i+=500)await NotificationRead.bulkWrite(operations.slice(i,i+500),{ordered:false});
 res.json({success:true,data:await notificationData(req.user)});
}catch(e){next(e)}}
export async function streamNotifications(req,res){
 res.set({"Content-Type":"text/event-stream","Cache-Control":"no-cache","Connection":"keep-alive"});res.flushHeaders();
 let closed=false,last="",timer;
 const close=()=>{closed=true;clearTimeout(timer)};res.on("close",close);
 const tick=async()=>{
  try{
   verifyAccessToken((req.get("authorization")||"").split(" ")[1]);
   const user=await User.findById(req.user._id).select("_id role isActive").lean();
   if(!user?.isActive||user.role!==req.user.role){close();res.end();return}
   const value=JSON.stringify(await notificationData(user));
   if(!closed){if(value!==last){res.write(`data: ${value}\n\n`);last=value}else res.write(": heartbeat\n\n")}
  }catch{close();res.end();return}
  if(!closed)timer=setTimeout(tick,3000);
 };await tick();
}
