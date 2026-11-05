import {createHash} from "node:crypto";
import PropertyAssignment from "../models/PropertyAssignment.js";
import User from "../models/User.js";
import { verifyAccessToken } from "../utils/jwt.js";
const visible=(n,user)=>n.recipient===String(user._id)||(["ADMIN","STAFF"].includes(n.recipient)&&user.role===n.recipient);
export async function notificationData(user){
 const accounts=await PropertyAssignment.find({$or:[{notifications:{$elemMatch:{recipient:{$in:[String(user._id),...(["ADMIN","STAFF"].includes(user.role)?[user.role]:[])]}}}},{"contract.monitoringTerms":{$ne:null}},{commissionAgreement:{$ne:null}}]}).select("notifications __v").lean();
 const rows=accounts.flatMap(a=>(a.notifications||[]).filter(n=>visible(n,user)).map(n=>({...n,accountId:a._id,read:(n.readBy||[]).includes(String(user._id))}))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
 return {version:createHash("sha256").update(accounts.map(a=>`${a._id}:${a.__v||0}`).sort().join("|")).digest("hex"),rows:rows.slice(0,100),unread:rows.filter(n=>!n.read&&(!n.monitoringAlert||n.active!==false||n.eventOnly)).length};
}
export async function listNotifications(req,res,next){try{res.json({success:true,data:await notificationData(req.user)})}catch(e){next(e)}}
export async function readNotifications(req,res,next){
 try{
  const recipients=[String(req.user._id),...(["ADMIN","STAFF"].includes(req.user.role)?[req.user.role]:[])];
  const match={recipient:{$in:recipients},...(req.params.notificationId?{id:req.params.notificationId}:{})};
  await PropertyAssignment.updateMany({notifications:{$elemMatch:match}},{$addToSet:{"notifications.$[n].readBy":String(req.user._id)},$inc:{__v:1}},{arrayFilters:[{"n.recipient":{$in:recipients},...(req.params.notificationId?{"n.id":req.params.notificationId}:{})}]});
  res.json({success:true,data:await notificationData(req.user)});
 }catch(e){next(e)}
}
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
