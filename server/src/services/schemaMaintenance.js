import mongoose from 'mongoose';
import {createHash} from 'node:crypto';
import {inspectDatabaseReadiness,databaseModels} from './databaseReadiness.js';
import {applyActiveContractUpgrade} from './activeContractUpgrade.js';
// Duplicate preflight is read-only. MongoDB remains the final unique-index authority.
export async function indexDuplicateConflicts(db,definitions){const conflicts=[];
 for(const d of definitions.filter(d=>d.unique)){
 const match=d.options.partialFilterExpression||{},keys=Object.keys(d.key),project=Object.fromEntries(keys.map((key,i)=>['k'+i,'$'+key]));project.doc='$_id';
 const pipeline=[{$match:{$and:[match,...(d.options.sparse?[{$or:keys.map(k=>({[k]:{$exists:true}}))}]:[])]}},{$project:project},...keys.map((_,i)=>({$unwind:{path:'$k'+i,preserveNullAndEmptyArrays:true}})),{$group:{_id:{doc:'$doc',...Object.fromEntries(keys.map((_,i)=>['k'+i,{$ifNull:['$k'+i,null]}]))}}},{$group:{_id:Object.fromEntries(keys.map((_,i)=>['k'+i,'$_id.k'+i])),count:{$sum:1},documents:{$push:'$_id.doc'}}},{$match:{count:{$gt:1}}},{$limit:20}];
 const duplicates=await db.collection(d.collection).aggregate(pipeline).toArray();if(duplicates.length)conflicts.push({collection:d.collection,key:d.key,duplicates});
 }
 return conflicts;
}
export async function schemaMaintenancePlan(){
 const state=await inspectDatabaseReadiness();if(!state.indexes)throw Object.assign(new Error('Database inspection is unavailable. Restore connectivity before planning maintenance.'),{statusCode:503});const db=mongoose.connection.db,duplicates=await indexDuplicateConflicts(db,state.indexes.missing),collections=await db.listCollections({},{nameOnly:true}).toArray();
 const metadata=new Set(['rems_schema_state','rems_installation','activitylogs']);let populated=false;for(const {name}of collections)if(!metadata.has(name)&&!name.startsWith('system.')&&await db.collection(name).findOne({},{projection:{_id:1}})){populated=true;break}
 const blocked=!!(state.futureSchema||state.contracts.conflicts.length||state.contracts.invalidLifecycles||state.contracts.namedIndexConflict||state.indexes.conflicts.length||duplicates.length);
 const plan={...state.contracts,schema:state,indexes:state.indexes,duplicates,populated,requiresBackup:populated&&!state.ready,canApply:state.transactions.supported&&!blocked,pendingMaintenance:state.pendingMaintenance,steps:[...(state.indexes.missing.length?['Create only missing index definitions; preserve valid equivalent indexes.']:[]),...(state.contracts.legacyAccounts?['Backfill only missing lifecycle values as ACTIVE after conflict review.']:[]),...(state.contracts.legacyIndexes.length?['Remove only identified obsolete global property-uniqueness indexes after verifying the active index.']:[]),'Verify actual schema and transactions; record successful schema version.']};
 return {...plan,token:createHash('sha256').update(JSON.stringify({database:state.database,fingerprint:state.expectedFingerprint,contracts:state.contracts,indexes:state.indexes,duplicates,populated})).digest('hex')};
}
export async function applyReviewedSchema(plan,{backupReference}={}){
 if(!plan.canApply)throw Object.assign(new Error('Resolve topology, duplicate contracts or index conflicts first. No automatic conflict resolution is available.'),{statusCode:409});
 if(plan.requiresBackup&&!backupReference)throw Object.assign(new Error('Populated database maintenance requires a recovery-verified backup. Routine transactions do not.'),{statusCode:409});
 // Fail before altering contract lifecycle/history if any additive index cannot be created.
 const db=mongoose.connection.db;for(const d of plan.indexes.missing)await db.collection(d.collection).createIndex(d.key,d.options);
 await applyActiveContractUpgrade(db,{backupReference:backupReference||'ADMIN_APPROVED_EMPTY_DATABASE_SETUP',transactionalBackfill:true});
 const verified=await inspectDatabaseReadiness({record:true,probe:true});if(!verified.ready)throw Object.assign(new Error('Maintenance did not pass final verification. Review current readiness; do not repeat ordinary transactions until resolved.'),{statusCode:409});return {before:plan.schema.contracts,after:verified.contracts,backupReference:backupReference||null,ready:true,schemaVersion:verified.verifiedSchemaVersion,lastSuccessfulVerification:verified.lastSuccessfulVerification};
}
