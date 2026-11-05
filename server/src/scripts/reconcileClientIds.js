// Explicit maintenance command; never invoked on application startup.
// Default is read-only. Back up the office database before using --apply.
import "dotenv/config";
import mongoose from "mongoose";
import Client from "../models/Client.js";
import ActivityLog from "../models/ActivityLog.js";
import {generateRecordId} from "../utils/generateRecordId.js";
if(!process.env.MONGODB_URI)throw new Error("MONGODB_URI is required.");
await mongoose.connect(process.env.MONGODB_URI);
try{
 const missing={$or:[{clientId:{$exists:false}},{clientId:null},{clientId:""}]};
 const clients=await Client.collection.find(missing,{projection:{_id:1,clientId:1}}).toArray();
 console.log(`${clients.length} clients have no ID. Existing nonempty IDs will be preserved.`);
 if(!process.argv.includes("--apply"))console.log("Dry run only. No records or counters changed.");
 else for(const c of clients){
  const clientId=await generateRecordId("client");
  const event=await ActivityLog.create({module:"Clients",action:"CLIENT_ID_BACKFILLED",username:"maintenance",outcome:"PENDING",entityType:"Client",entityId:String(c._id),previousValues:{clientId:c.clientId},updatedValues:{clientId}});
  const result=await Client.collection.updateOne({_id:c._id,...missing},{$set:{clientId}});
  await ActivityLog.updateOne({_id:event._id},{$set:{outcome:result.modifiedCount?"SUCCEEDED":"FAILED",completedAt:new Date()}});
 }
}finally{await mongoose.disconnect()}
