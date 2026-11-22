import mongoose from 'mongoose';
import {createHash,randomUUID} from 'node:crypto';
import {databaseModels,transactionReadiness} from './databaseReadiness.js';
import {assertResetBackup,createBackup,readJob,withExclusiveDatabaseMaintenance} from './databaseMaintenance.js';
import User from '../models/User.js';
import ActivityLog from '../models/ActivityLog.js';
import {resetPreparation,resumeAfterReset} from './maintenanceGate.js';

const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode})};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const RESET_PHRASE='RESET REMS DATA';
// Explicit model allowlist, in dependency order. Never accept collection names
// or arbitrary MongoDB filters from the browser.
export const RESET_GROUPS=[
 ['Dependent records',['NotificationRead','SiteRequestAttachment','MigrationDocument','MapOverlayVersion','PenaltyCycleIdentity','PaymentIntentClaim','ReceiptClaim','PaymentBatch','CommissionVoucher','ReportBrandSnapshot','SalesPlanningRecord']],
 ['Cash and contract adjustments',['RefundRelease','CancellationCase','AssumptionCase','LotTransfer','OfficePayout','OfficeCashReview','Expense','CashLedgerEntry']],
 ['Client and property records',['SiteRequest','MigrationBatch','Reservation','PropertyAssignment','MapOverlay','ProjectMap','Property','Block','Phase','Project','Client','Agent']]
];
export const RESET_PRESERVE=['User','ActivityLog','AdministrationGuard','SequenceCounter','Company','ReservationSettings','SiteRequestSettings','MigrationConfig'];
const metadata=['rems_schema_state','rems_installation'];
export function identifiedResetDatabase(name,uri){
 const match=/^mongodb(?:\+srv)?:\/\/[^/?]+\/([^?]+)(?:\?.*)?$/.exec(uri||'');
 let configured='';try{configured=decodeURIComponent(match?.[1]||'')}catch{}
 if(!/^[\p{L}\p{N}_-]+$/u.test(name||'')||configured!==name||['admin','local','config'].includes(name.toLowerCase())||/^rems_recovery_/i.test(name))fail('Reset requires an explicitly configured, identified REMS database. Recovery and MongoDB system databases are not eligible.');
 return name;
}
export function classifyResetCollections(models,collections){
 const entries=Object.fromEntries(Object.entries(models).map(([key,m])=>[key,m.collection.collectionName]));
 const deletion=RESET_GROUPS.flatMap(([group,names])=>names.map(model=>({model,group,name:entries[model]})));
 const preserved=RESET_PRESERVE.map(model=>({model,name:entries[model]}));
 if([...deletion,...preserved].some(x=>!x.name))fail('Reset scope does not match the installed REMS models.');
 const known=new Set([...deletion,...preserved].map(x=>x.name).concat(metadata));
 const unknown=collections.filter(c=>!known.has(c.name)&&!c.name.startsWith('system.')).map(c=>c.name);
 const unsupported=collections.filter(c=>deletion.some(r=>r.name===c.name)&&c.type&&c.type!=='collection').map(c=>c.name);
 const unclassified=Object.entries(entries).filter(([,name])=>!known.has(name)).map(([model])=>model);
 return {deletion,preserved,unknown:[...unknown,...unsupported,...unclassified],metadata};
}
const attempts=new Map();
export async function verifyAdmin(actorId,password){
 const now=Date.now(),key=String(actorId),previous=attempts.get(key);
 if(previous&&previous.until>now&&previous.count>=5)fail('Too many password confirmation attempts. Try again in five minutes.',429);
 if(typeof password!=='string'||!password||password.length>4096)fail('Enter your current administrator password.',400);
 const user=await User.findById(actorId).select('+passwordHash');
 if(!user||!user.isActive||user.role!=='ADMIN'||!await user.comparePassword(password)){
  const count=previous?.until>now?previous.count+1:1;attempts.set(key,{count,until:now+300000});fail('Administrator password verification failed.',403);
 }
 attempts.delete(key);
 return {userId:String(user._id),username:user.username,role:user.role};
}
const connection=()=>{
 if(mongoose.connection.readyState!==1||!mongoose.connection.db)fail('Database is not connected.');
 const db=mongoose.connection.db,name=identifiedResetDatabase(db.databaseName,process.env.MONGODB_URI);
 if(mongoose.connection.name!==name)fail('Database identity changed. Reset blocked.');
 return {db,name};
};
async function inspect(actorId,backupId='',{verifyBackup=false}={}){
 const {db,name}=connection(),models=await databaseModels(),collections=await db.listCollections({},{nameOnly:false}).toArray(),present=new Set(collections.map(c=>c.name));
 const scope=classifyResetCollections(models,collections);
 const deletion=[];
 for(const row of scope.deletion)deletion.push({...row,count:present.has(row.name)?await db.collection(row.name).countDocuments({}):0,present:present.has(row.name)});
 const embedded=[];
 for(const [model,fields] of Object.entries({
  PropertyAssignment:{payments:'Contract payment receipts', 'contract.schedule':'Scheduled installments', 'commissionSnapshot.records':'Commission snapshot rows', commissionPayouts:'Commission releases', commissionRecoveries:'Commission recoveries', penaltyLedger:'Penalty ledger entries', historicalPenalties:'Historical penalty rows', penaltyWaivers:'Penalty waivers', correctionRequests:'Payment correction requests', notifications:'Contract notifications'},
  Reservation:{precontractPayments:'Additional pre-contract payment receipts',precontractRefunds:'Pre-contract refund records'}
 })){
  const row=deletion.find(r=>r.model===model);if(!row?.present)continue;
  const keys=Object.keys(fields),group={_id:null};
  keys.forEach((field,i)=>{const path='$'+field;group['n'+i]={$sum:{$cond:[{$isArray:path},{$size:path},0]}}});
  const [counts]=await db.collection(row.name).aggregate([{$group:group}]).toArray();
  keys.forEach((field,i)=>embedded.push({label:fields[field],count:counts?.['n'+i]||0}));
 }
 const preserve=[];
 for(const row of scope.preserved)preserve.push({...row,count:present.has(row.name)?await db.collection(row.name).countDocuments({}):0,present:present.has(row.name)});
 const company=scope.preserved.find(r=>r.model==='Company').name,migration=scope.preserved.find(r=>r.model==='MigrationConfig').name;
 const updates=[
  {name:company,model:'Company',description:'Remove current project links; preserve company profile, logo and history',count:present.has(company)?await db.collection(company).countDocuments({'projects.0':{$exists:true}}):0},
  {name:migration,model:'MigrationConfig',description:'Return migration workflow to unused setup; preserve configuration and audit history',count:present.has(migration)?await db.collection(migration).countDocuments({_id:'OFFICE'}):0}
 ];
 if(present.has(migration)&&await db.collection(migration).countDocuments({_id:{$ne:'OFFICE'}}))scope.unknown.push('Unrecognized migration configuration record');
 const transactions=await transactionReadiness(db);
 const total=deletion.reduce((n,r)=>n+r.count,0),changes=updates.reduce((n,r)=>n+r.count,0);
 const token=hash({name,actorId:String(actorId),backupId,deletion:deletion.map(({name,count,present})=>({name,count,present})),embedded,updates:updates.map(({name,count})=>({name,count})),unknown:scope.unknown.sort()});
 let backup=null;
 if(backupId){const job=await readJob(backupId);if(job.purpose!=='SYSTEM_RESET'||String(job.actor?.userId)!==String(actorId))fail('Choose a reset-specific backup created by this administrator.');backup={id:job.id,state:job.state,createdAt:job.createdAt,verifiedAt:job.recoveryVerifiedAt||null,recoveryTarget:job.recoveryTarget||null,directory:job.dumpDir,error:job.error||null,used:!!await ActivityLog.exists({action:'SYSTEM_DATA_RESET',outcome:{$in:['SUCCEEDED','PENDING']},'metadata.backupId':backupId})};}
 if(verifyBackup&&backup?.state==='RECOVERY_VERIFIED'&&!backup.used&&!scope.unknown.length){
  try{await assertResetBackup(backupId,{actorId,names:[...deletion.filter(r=>r.present).map(r=>r.name),...updates.filter(r=>r.count).map(r=>r.name)]});backup.fresh=true;}
  catch(error){backup.fresh=false;backup.freshnessError=error.statusCode?error.message:'Unable to verify the current backup files. Create a fresh backup.';}
 }
 return {database:name,deletion,preserve,updates,embedded,unknown:scope.unknown,metadata:scope.metadata,total,changes,transactionsSupported:transactions.supported,token,backup,canReset:transactions.supported&&!scope.unknown.length&&(total+changes>0)&&!backup?.used&&backup?.fresh!==false};
}
export const resetPreview=(actorId,backupId)=>inspect(actorId,backupId,{verifyBackup:true});
export async function prepareResetBackup(actor,body){
 const plan=await inspect(actor.userId);
 if(actor.role!=='ADMIN'||body.database!==plan.database||body.token!==plan.token||body.confirm!==true||body.singleBackendConfirmed!==true||!plan.canReset)fail('Review the current database, scope and single-writer confirmation before creating a reset backup.');
 return createBackup(actor,{singleBackendConfirmed:true,purpose:'SYSTEM_RESET'});
}
// The only deletion primitive used by reset. Each collection and filter is
// derived from the trusted installed model allowlist, never request data.
export async function applyResetPlan(db,session,plan,actor,operationId){
 const models=await databaseModels(),trusted=classifyResetCollections(models,[]);
 const allowed=new Set(trusted.deletion.map(r=>r.name));
 if(plan.deletion.length!==allowed.size||new Set(plan.deletion.map(r=>r.name)).size!==allowed.size||plan.deletion.some(r=>!allowed.has(r.name)))fail('Reset deletion allowlist mismatch.');
 const expected=new Map(trusted.preserved.filter(r=>['Company','MigrationConfig'].includes(r.model)).map(r=>[r.model,r.name]));
 if(plan.updates.length!==2||new Set(plan.updates.map(r=>r.model)).size!==2||plan.updates.some(r=>expected.get(r.model)!==r.name))fail('Reset update allowlist mismatch.');
 const deleted=[];
 for(const row of plan.deletion){
  if(!row.present){if(row.count!==0)fail('Reset scope changed.');continue;}
  const collection=db.collection(row.name);
  if(await collection.countDocuments({},{session})!==row.count)fail('Reset count changed for '+row.name+'.');
  const result=await collection.deleteMany({},{session});
  if(result.deletedCount!==row.count||await collection.countDocuments({},{session})!==0)fail('Reset deletion verification failed for '+row.name+'.');
  deleted.push({name:row.name,count:result.deletedCount});
 }
 for(const row of plan.updates){
  if(!row.count)continue;
  const collection=db.collection(row.name),event={action:'SYSTEM_DATA_RESET',operationId,actor,timestamp:new Date()};
  const result=row.model==='Company'?await collection.updateMany({'projects.0':{$exists:true}},{$set:{projects:[],updatedAt:new Date()},$push:{history:event}},{session}):await collection.updateOne({_id:'OFFICE'},{$set:{cutoffDate:null,stagingStarted:false,activationSequence:0,updatedAt:new Date()},$unset:{backupReference:'',recoveryTestReference:''},$push:{history:event}},{session});
  if(result.matchedCount!==row.count)fail('Reset configuration scope changed for '+row.name+'.');
  if(row.model==='Company'&&await collection.countDocuments({'projects.0':{$exists:true}},{session}))fail('Company links were not cleared.');
  if(row.model==='MigrationConfig'&&await collection.countDocuments({_id:'OFFICE',cutoffDate:null,stagingStarted:false,activationSequence:0,backupReference:{$exists:false},recoveryTestReference:{$exists:false}},{session})!==1)fail('Migration setup was not reset.');
 }
 return deleted;
}
export async function executeSystemReset(actorId,body){
 if(body.confirm!==true||body.singleBackendConfirmed!==true||body.confirmation!==RESET_PHRASE||typeof body.backupId!=='string'||!body.backupId)fail('Explicit reset approval, database identity and recovery-verified backup are required.',400);
 const hold=resetPreparation();if(hold&&hold.actorId!==String(actorId))fail('Another administrator is preparing a system reset.');
 return withExclusiveDatabaseMaintenance(async()=>{
  const actor=await verifyAdmin(actorId,body.password),plan=await inspect(actorId,body.backupId);
  if(body.database!==plan.database||body.token!==plan.token||!plan.canReset||plan.backup?.state!=='RECOVERY_VERIFIED')fail('Reset preview or backup changed. Review the current scope again.');
  const {db}=connection(),operationId='RESET-'+randomUUID();
  if(await ActivityLog.exists({action:'SYSTEM_DATA_RESET',outcome:{$in:['SUCCEEDED','PENDING']},'metadata.backupId':body.backupId}))fail('This backup has already authorized a reset or an unresolved reset attempt. Review Activity Logs and create a fresh backup.');
  const names=[...plan.deletion.filter(r=>r.present).map(r=>r.name),...plan.updates.filter(r=>r.count).map(r=>r.name)];
  const backup=await assertResetBackup(body.backupId,{actorId,names});
  const journal=await ActivityLog.create({action:'SYSTEM_DATA_RESET',module:'Database & Backups',username:actor.username,userRole:'ADMIN',userId:actorId,entityType:'DatabaseReset',entityId:operationId,outcome:'PENDING',description:'Administrator approved transactional system data reset',metadata:{operationId,database:plan.database,backupId:backup.id,backup,planned:plan.deletion.map(({name,count})=>({name,count})),embedded:plan.embedded,configurationUpdates:plan.updates}});
  const session=await mongoose.startSession();let result;
  try{
   await session.withTransaction(async()=>{
    // Verify the exact destructive scope in the transaction snapshot as well.
    await assertResetBackup(body.backupId,{actorId,names,session});
    if(!await User.exists({_id:actorId,role:'ADMIN',isActive:true}).session(session))fail('Administrator account changed. Reset aborted.');
    const deleted=await applyResetPlan(db,session,plan,actor,operationId);
    const totalDeleted=deleted.reduce((n,r)=>n+r.count,0);
    if(totalDeleted!==plan.total)fail('Reset totals did not reconcile.');
    for(const row of plan.preserve.filter(r=>r.present&&r.model!=='ActivityLog'))if(await db.collection(row.name).countDocuments({},{session})!==row.count)fail('Preserved collection count changed for '+row.name+'.');
    if(!await User.exists({_id:actorId,role:'ADMIN',isActive:true}).session(session))fail('Administrator account preservation check failed.');
    const verification={operationalCollectionsEmpty:true,preservedUsers:plan.preserve.find(r=>r.model==='User').count,administratorPreserved:true,configurationCountsPreserved:true,cashOpeningRequired:true};
    const audit=await ActivityLog.updateOne({_id:journal._id,outcome:'PENDING'},{$set:{outcome:'SUCCEEDED',completedAt:new Date(),'metadata.deleted':deleted,'metadata.totalDeleted':totalDeleted,'metadata.verification':verification}},{session});
    if(audit.modifiedCount!==1)fail('Reset audit could not be saved. No reset committed.');
    result={operationId,database:plan.database,backup,totalDeleted,deleted,configurationUpdates:plan.updates,verification};
   },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});
   resumeAfterReset(actorId);return result;
  }catch(error){
   // The audit marker is committed atomically with the reset. Never declare
   // failure if a network interruption left the commit result uncertain.
   const saved=await ActivityLog.findById(journal._id).lean().catch(()=>null);
   if(saved?.outcome==='SUCCEEDED'){resumeAfterReset(actorId);return {operationId,database:plan.database,backup,totalDeleted:saved.metadata.totalDeleted,deleted:saved.metadata.deleted,configurationUpdates:plan.updates,verification:saved.metadata.verification};}
   if(saved?.outcome==='PENDING'&&!error.hasErrorLabel?.('UnknownTransactionCommitResult'))await ActivityLog.updateOne({_id:journal._id,outcome:'PENDING'},{$set:{outcome:'FAILED',completedAt:new Date(),description:'Reset transaction aborted; no partial reset committed'}}).catch(()=>{});
   throw error;
  }finally{await session.endSession()}
 });
}
