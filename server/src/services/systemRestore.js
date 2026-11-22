import mongoose from 'mongoose';
import {createHash,randomUUID} from 'node:crypto';
import ActivityLog from '../models/ActivityLog.js';
import {databaseModels,transactionReadiness} from './databaseReadiness.js';
import {classifyResetCollections,identifiedResetDatabase,verifyAdmin} from './systemReset.js';
import {verifiedRestoreSource,sourceMetrics,digestCollection,indexSignature,createBackup,withExclusiveDatabaseMaintenance,assertResetMetricsUnchanged} from './databaseMaintenance.js';
import {resetPreparation,resumeAfterReset} from './maintenanceGate.js';

export const RESTORE_PHRASE='RESTORE REMS DATA';
const fail=message=>{throw Object.assign(new Error(message),{statusCode:409})};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const keys=o=>Object.keys(o||{}).sort();
const hash=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');

// Keep current credentials, administration lock, ID counters, and audit trail.
// Restore company and migration data too, because they reference operational records.
export function restoreScope(models,collections){
 const scope=classifyResetCollections(models,collections);
 const preservedModels=new Set(['User','ActivityLog','SequenceCounter','AdministrationGuard']);
 const rows=[...scope.deletion,...scope.preserved.filter(r=>!preservedModels.has(r.model))];
 const preserved=[...scope.preserved.filter(r=>preservedModels.has(r.model)).map(r=>r.name),...scope.metadata];
 if(scope.unknown.length||collections.some(c=>!c.name.startsWith('system.')&&c.type&&c.type!=='collection'))fail('Unknown or unsupported database collections. Restore requires a reviewed schema.');
 return {rows,preserved};
}

async function inspect(actorId,sourceId,safetyId=''){
 if(typeof sourceId!=='string'||!sourceId||typeof safetyId!=='string')fail('Select a verified source backup and, when ready, a separate safety backup.');
 const db=mongoose.connection.db,database=identifiedResetDatabase(db?.databaseName,process.env.MONGODB_URI);
 if(!db||mongoose.connection.name!==database)fail('Connected database identity changed.');
 if(!(await transactionReadiness(db)).supported)fail('Writable MongoDB transaction support is required.');
 const source=await verifiedRestoreSource(sourceId),current=await sourceMetrics(db);
 const models=await databaseModels(),{rows,preserved}=restoreScope(models,await db.listCollections().toArray());
 if(!same(keys(current),keys(source.job.collections)))fail('Backup collection set differs from the current schema. Restore requires a compatible backup.');
 const scope=rows.filter(r=>Object.hasOwn(current,r.name));
 for(const {name} of scope){
  if(!same(await indexSignature(db,name),source.job.indexes?.[name])||!same(await indexSignature(source.db,name),source.job.indexes?.[name]))fail('Backup or current indexes differ for '+name+'. Restore blocked.');
  if(!same(await digestCollection(source.db,name),source.job.collections[name]))fail('Isolated recovery data changed for '+name+'. Verify the source backup again.');
 }
 const counts=scope.map(({name,model})=>({name,model,current:current[name].count,restore:source.job.collections[name].count}));
 const counterName=models.SequenceCounter.collection.collectionName;
 if(Object.hasOwn(current,counterName)){
  if(!same(await digestCollection(source.db,counterName),source.job.collections[counterName]))fail('Recovery copy ID counters changed. Verify the source backup again.');
  const counters=new Map((await db.collection(counterName).find({}).toArray()).map(r=>[r._id,r.value]));
  for(const row of await source.db.collection(counterName).find({}).toArray())if(!Number.isSafeInteger(row.value)||!Number.isSafeInteger(counters.get(row._id))||counters.get(row._id)<row.value)fail('Current ID counters are behind the backup. Administrator reconciliation is required before restoring.');
 }
 const token=hash({database,actorId,sourceId,safetyId,source:source.job.collections,current:safetyId?Object.fromEntries(Object.entries(current).filter(([n])=>n!=='activitylogs')):counts});
 let safety=null;
 if(safetyId){
  if(safetyId===sourceId)fail('The safety backup must be different from the source backup.');
  const verified=await verifiedRestoreSource(safetyId),job=verified.job;
  if(job.purpose!=='SYSTEM_RESTORE'||String(job.actor?.userId)!==String(actorId))fail('Create a fresh pre-restore backup as the current administrator.');
  if(!same(keys(current),keys(job.collections)))fail('Safety backup collection set changed.');
  const names=keys(current).filter(n=>n!=='activitylogs');
  assertResetMetricsUnchanged(current,job.collections,names);
  for(const name of names){if(!same(await indexSignature(db,name),job.indexes?.[name])||!same(await indexSignature(verified.db,name),job.indexes?.[name])||!same(await digestCollection(verified.db,name),job.collections[name]))fail('Safety backup no longer verifies for '+name+'.');}
  if(await ActivityLog.exists({action:'SYSTEM_DATA_RESTORE',outcome:'SUCCEEDED','metadata.safetyId':safetyId}))fail('This safety backup has already authorized a restore. Create a fresh one.');
  safety={id:safetyId,createdAt:job.createdAt,verifiedAt:job.recoveryVerifiedAt};
 }
 return {database,sourceId,safety,token,counts,preserved,sourceCreatedAt:source.job.createdAt,scope,source,current};
}
const publicPlan=({scope,source,current,...plan})=>plan;
export const restorePreview=async(actorId,sourceId,safetyId)=>publicPlan(await inspect(actorId,sourceId,safetyId));
export async function prepareRestoreBackup(actor,body){
 if(actor.role!=='ADMIN'||body.confirm!==true||body.singleBackendConfirmed!==true)fail('Administrator and single-writer confirmation required.');
 const plan=await inspect(actor.userId,body.sourceId);
 if(body.database!==plan.database||body.token!==plan.token)fail('Restore preview changed. Review again before creating the safety backup.');
 return createBackup(actor,{singleBackendConfirmed:true,purpose:'SYSTEM_RESTORE'});
}

// No live schema drops, external restore command, or partial commit. BSON values
// are copied without converting decimal/long/integer types to JavaScript numbers.
export async function replaceRestoreCollection(live,source,name,session,expected){
 const collection=live.collection(name);
 await collection.deleteMany({},{session});
 let batch=[];
 for await(const raw of source.collection(name).find({},{raw:true,session})){
  batch.push(mongoose.mongo.BSON.deserialize(raw,{promoteValues:false,promoteLongs:false}));
  if(batch.length>=100){await collection.insertMany(batch,{session,ordered:true});batch=[];}
 }
 if(batch.length)await collection.insertMany(batch,{session,ordered:true});
 if(!same(await digestCollection(live,name,session),expected))fail('Restored data verification failed for '+name+'. No partial restoration committed.');
}

export async function executeSystemRestore(actorId,body){
 if(body.confirm!==true||body.singleBackendConfirmed!==true||body.confirmation!==RESTORE_PHRASE||!body.sourceId||!body.safetyId)fail('Explicit restore approval and two distinct verified backups are required.');
 const hold=resetPreparation();if(hold&&hold.actorId!==String(actorId))fail('Another administrator is preparing maintenance.');
 return withExclusiveDatabaseMaintenance(async()=>{
  const actor=await verifyAdmin(actorId,body.password),plan=await inspect(actorId,body.sourceId,body.safetyId);
  if(body.database!==plan.database||body.token!==plan.token||!plan.safety)fail('Restore preview changed. Review again.');
  const db=mongoose.connection.db,session=await mongoose.startSession(),operationId='RESTORE-'+randomUUID();
  try{
   await session.withTransaction(async()=>{
    for(const name of keys(plan.current).filter(n=>n!=='activitylogs'))if(!same(await digestCollection(db,name,session),plan.current[name]))fail('Live data changed after review. Create a new safety backup.');
    for(const {name} of plan.scope){
     const expected=plan.source.job.collections[name];
     if(!same(await digestCollection(plan.source.db,name,session),expected))fail('Recovery copy changed. Restore aborted.');
     await replaceRestoreCollection(db,plan.source.db,name,session,expected);
    }
    await ActivityLog.create([{action:'SYSTEM_DATA_RESTORE',module:'Database & Backups',username:actor.username,userRole:'ADMIN',userId:actorId,entityType:'DatabaseRestore',entityId:operationId,outcome:'SUCCEEDED',description:'Verified operational data restored transactionally',metadata:{database:plan.database,sourceId:body.sourceId,safetyId:body.safetyId,counts:plan.counts,preserved:plan.preserved}}],{session});
   },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});
   resumeAfterReset(actorId);
   return {operationId,...publicPlan(plan)};
  }catch(error){
   const audit=await ActivityLog.findOne({entityId:operationId,action:'SYSTEM_DATA_RESTORE',outcome:'SUCCEEDED'}).lean().catch(()=>null);
   if(audit){resumeAfterReset(actorId);return {operationId,...publicPlan(plan)};}
   if(error.hasErrorLabel?.('UnknownTransactionCommitResult'))fail('Restore outcome uncertain. Check Activity Logs for '+operationId+' before retrying.');
   throw error;
  }finally{await session.endSession();}
 });
}
