import ActivityLog from "../models/ActivityLog.js";
// Dry run by default. Run with --apply only after reviewing an office DB backup.
import 'dotenv/config';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Client from '../models/Client.js';
import Agent from '../models/Agent.js';
import Expense from '../models/Expense.js';
import Property from '../models/Property.js';
import Phase from '../models/Phase.js';
import Block from '../models/Block.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import {generateRecordId} from '../utils/generateRecordId.js';
if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required.');
await mongoose.connect(process.env.MONGODB_URI);
try{
 const modules=[[Project,'projectId','project'],[Client,'clientId','client'],[Agent,'agentId','agent'],[Expense,'expenseId','expense'],[Property,'propertyId','property'],[Phase,'phaseId','phase'],[Block,'blockId','block'],[PropertyAssignment,'assignmentId','contract']];
 // Fail before modifying anything if conflicting existing IDs are present.
 for(const [model,field] of modules){const conflicts=await model.aggregate([{$match:{[field]:{$type:'string',$ne:''}}},{$group:{_id:`$${field}`,count:{$sum:1}}},{$match:{count:{$gt:1}}}]);if(conflicts.length)throw new Error(`${model.modelName}: conflicting ${field} values; no backfill performed.`)}
 for(const [array,field] of [['payments','paymentId'],['commissionPayouts','payoutId'],['correctionRequests','requestNumber']]){const conflicts=await PropertyAssignment.aggregate([{$unwind:`$${array}`},{$match:{[`${array}.${field}`]:{$type:'string',$ne:''}}},{$group:{_id:`$${array}.${field}`,count:{$sum:1}}},{$match:{count:{$gt:1}}}]);if(conflicts.length)throw new Error(`Conflicting embedded ${field} values; stop and review their relationships.`)}
 for(const [model,field,type] of modules){const missing={$or:[{[field]:{$exists:false}},{[field]:null},{[field]:''}]},rows=await model.find(missing).select('_id').lean();console.log(`${model.modelName}: ${rows.length} missing ${field}`);if(process.argv.includes('--apply'))for(const row of rows){const value=await generateRecordId(type);const audit=await ActivityLog.create({action:'INTERNAL_ID_BACKFILL',module:'Migration',username:'SYSTEM_MIGRATION',userRole:'SYSTEM',entityType:model.modelName,entityId:String(row._id),outcome:'PENDING',updatedValues:{[field]:value}});const result=await model.collection.updateOne({_id:row._id,...missing},{$set:{[field]:value}});await ActivityLog.updateOne({_id:audit._id},{$set:{outcome:result.modifiedCount?'SUCCEEDED':'FAILED',completedAt:new Date(),description:result.modifiedCount?'Filled missing identifier; original MongoDB relationship retained.':'Record changed concurrently; no identifier overwritten.'}})}}
 console.log(process.argv.includes('--apply')?'Missing top-level IDs backfilled; existing IDs, receipts and relationships unchanged.':'Dry run only. No records changed.');
}finally{await mongoose.disconnect()}
