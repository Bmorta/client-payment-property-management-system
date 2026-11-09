import {createHash} from "node:crypto";
import mongoose from "mongoose";
import PropertyAssignment from "../models/PropertyAssignment.js";
import NotificationRead from "../models/NotificationRead.js";
import User from "../models/User.js";
import {verifyAccessToken} from "../utils/jwt.js";
const visible=(n,user)=>n.recipient===String(user._id)||(["ADMIN","STAFF"].includes(n.recipient)&&user.role===n.recipient);
const readKey=(user,account,id)=>createHash('sha256').update(JSON.stringify([String(user),String(account),id])).digest('hex');
async function visibleRows(user){
 const accounts=await PropertyAssignment.find({notifications:{$elemMatch:{recipient:{$in:[String(user._id),...(["ADMIN","STAFF"].includes(user.role)?[user.role]:[])]}}}}).select("notifications __v").lean();
 const reads=await NotificationRead.find({user:user._id,account:{$in:accounts.map(a=>a._id)}}).select('_id').lean(),keys=new Set(reads.map(r=>r._id));
 const rows=accounts.flatMap(a=>(a.notifications||[]).map((n,index)=>({...n,id:n.id||'legacy-'+createHash('sha256').update(JSON.stringify([String(a._id),index,n.createdAt,n.message,n.recipient])).digest('hex')})).filter(n=>visible(n,user)).map(n=>({...n,accountId:a._id,read:(n.readBy||[]).includes(String(user._id))||keys.has(readKey(user._id,a._id,n.id))}))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||String(a.id).localeCompare(String(b.id)));
 return {accounts,reads,rows};
}
export async function notificationData(user,{page=1,limit=100,q=''}={}){
 const {accounts,reads,rows}=await visibleRows(user),filtered=q?rows.filter(n=>String(n.message).toLowerCase().includes(q.toLowerCase())):rows;
 return {version:createHash('sha256').update(JSON.stringify([accounts.map(a=>`${a._id}:${a.__v||0}`).sort(),reads.map(r=>r._id).sort()])).digest('hex'),rows:filtered.slice((page-1)*limit,page*limit),total:filtered.length,page,pageSize:limit,unread:rows.filter(n=>!n.read&&(!n.monitoringAlert||n.active!==false||n.eventOnly)).length};
}
export async function listNotifications(req,res,next){try{
 const page=Number(req.query.page||1),limit=Number(req.query.limit||100),q=String(req.query.q||'').trim().slice(0,100);
 if(!Number.isSafeInteger(page)||page<1||page>100000||![10,25,50,100].includes(limit))return res.status(400).json({success:false,message:'Choose valid notification pagination.'});
 res.json({success:true,data:await notificationData(req.user,{page,limit,q})});
}catch(e){next(e)}}
export async function readNotifications(req,res,next){try{
 const accountId=req.body?.accountId;if(accountId&&!mongoose.isValidObjectId(accountId))return res.status(400).json({success:false,message:'Invalid notification account.'});
 const {rows}=await visibleRows(req.user),matching=rows.filter(n=>(!req.params.notificationId||n.id===req.params.notificationId)&&(!accountId||String(n.accountId)===accountId));
 if(req.params.notificationId&&!matching.length)return res.status(404).json({success:false,message:'Notification not found or not available to your role.'});
 if(req.params.notificationId&&!accountId&&new Set(matching.map(n=>String(n.accountId))).size>1)return res.status(400).json({success:false,message:'Select the specific account notification before marking it read.'});
 const operations=matching.filter(n=>!n.read).map(n=>({updateOne:{filter:{_id:readKey(req.user._id,n.accountId,n.id)},update:{$setOnInsert:{user:req.user._id,account:n.accountId,notificationId:n.id,readAt:new Date()}},upsert:true}}));
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
