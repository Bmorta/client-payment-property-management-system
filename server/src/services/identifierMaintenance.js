import mongoose from 'mongoose';
import {createHash} from 'node:crypto';
import Project from '../models/Project.js';
import Client from '../models/Client.js';
import Agent from '../models/Agent.js';
import Expense from '../models/Expense.js';
import Property from '../models/Property.js';
import Phase from '../models/Phase.js';
import Block from '../models/Block.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import ActivityLog from '../models/ActivityLog.js';
import {generateRecordId} from '../utils/generateRecordId.js';
import {assertEligibleBackup} from './databaseMaintenance.js';
import {withMaintenance} from './maintenanceGate.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=message=>{throw Object.assign(new Error(message),{statusCode:409})};
const modules=[[Project,'projectId','project'],[Client,'clientId','client'],[Agent,'agentId','agent'],[Expense,'expenseId','expense'],[Property,'propertyId','property'],[Phase,'phaseId','phase'],[Block,'blockId','block'],[PropertyAssignment,'assignmentId','contract']];
const missing=field=>({$or:[{[field]:{$exists:false}},{[field]:null},{[field]:''}]});
async function plan(mode){
 if(!['CLIENT_IDS','INTERNAL_IDS'].includes(mode))fail('Choose a supported identifier maintenance operation.');
 const selected=mode==='CLIENT_IDS'?modules.filter(([m])=>m===Client):modules,groups=[],conflicts=[];
 for(const [model,field,type]of selected){const duplicates=await model.collection.aggregate([{$match:{[field]:{$type:'string',$ne:''}}},{$group:{_id:'$'+field,count:{$sum:1}}},{$match:{count:{$gt:1}}}]).toArray();for(const d of duplicates)conflicts.push({module:model.modelName,field,value:d._id,count:d.count});const rows=await model.collection.find(missing(field),{projection:{_id:1,[field]:1}}).sort({_id:1}).toArray();groups.push({model,field,type,rows})}
 if(mode==='INTERNAL_IDS')for(const [array,field]of [['payments','paymentId'],['commissionPayouts','payoutId'],['correctionRequests','requestNumber']]){const duplicates=await PropertyAssignment.collection.aggregate([{$unwind:'$'+array},{$match:{[array+'.'+field]:{$type:'string',$ne:''}}},{$group:{_id:'$'+array+'.'+field,count:{$sum:1}}},{$match:{count:{$gt:1}}}]).toArray();for(const d of duplicates)conflicts.push({module:'PropertyAssignment',field:array+'.'+field,value:d._id,count:d.count})}
 conflicts.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const summary=groups.map(g=>({module:g.model.modelName,field:g.field,missing:g.rows.length})),total=summary.reduce((n,g)=>n+g.missing,0),token=hash({mode,groups:groups.map(g=>({module:g.model.modelName,field:g.field,rows:g.rows})),conflicts});return {groups,public:{mode,summary,total,conflicts,token,canApply:!conflicts.length&&total>0&&total<=10000}};
}
export async function identifierPreview(mode){return (await plan(mode)).public}
export async function applyIdentifierMaintenance({mode,backupId,token,requestId,confirm,singleBackendConfirmed},actor={}){
 if(confirm!==true||singleBackendConfirmed!==true)fail('Explicit approval and confirmation that other database writers are stopped are required.');
 if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId||''))fail('A valid unique submission ID is required.');
 const eventId=new mongoose.Types.ObjectId(hash(['identifier-maintenance',requestId]).slice(0,24)),signature=hash({mode,backupId,token}),previous=await ActivityLog.findById(eventId).lean();
 if(previous){if(previous.metadata?.signature!==signature)fail('Submission ID was used for different maintenance details.');if(previous.outcome==='SUCCEEDED')return {...previous.updatedValues,alreadyApplied:true};fail('This submission is pending or failed. Review the audit history and a fresh preview; it will not be replayed.');}
 return withMaintenance(async()=>{
  const current=await plan(mode);if(token!==current.public.token||!current.public.canApply)fail('Review a fresh conflict-free identifier preview.');await assertEligibleBackup(backupId,{operation:mode});
  const journal=await ActivityLog.create({_id:eventId,module:'Database & Backups',action:'IDENTIFIER_MAINTENANCE',username:actor.username||'maintenance',userRole:actor.role||'ADMIN',outcome:'PENDING',metadata:{requestId,signature,mode,backupId},previousValues:current.public});let changed=0;
  try{for(const g of current.groups)for(const row of g.rows){const value=await generateRecordId(g.type),entry=await ActivityLog.create({action:'INTERNAL_ID_BACKFILL',module:'Migration',username:actor.username||'maintenance',userRole:actor.role||'ADMIN',entityType:g.model.modelName,entityId:String(row._id),outcome:'PENDING',previousValues:{[g.field]:row[g.field]},updatedValues:{[g.field]:value},metadata:{requestId,backupId}});const result=await g.model.collection.updateOne({_id:row._id,...missing(g.field)},{$set:{[g.field]:value}});await ActivityLog.updateOne({_id:entry._id},{$set:{outcome:result.modifiedCount?'SUCCEEDED':'FAILED',completedAt:new Date()}});if(result.modifiedCount!==1)fail('A record changed during maintenance. Stop and review the per-record journal.');changed++}const result={changed,mode,backupId};await ActivityLog.updateOne({_id:journal._id},{$set:{outcome:'SUCCEEDED',updatedValues:result,completedAt:new Date()}});return result}
  catch(e){await ActivityLog.updateOne({_id:journal._id},{$set:{outcome:'FAILED',updatedValues:{changed,mode,backupId},completedAt:new Date(),description:'Stopped; review completed per-record changes before a new preview.'}});throw e}
 });
}
