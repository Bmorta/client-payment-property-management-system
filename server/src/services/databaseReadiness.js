import mongoose from 'mongoose';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inspectRequiredIndexes} from '../../../shared/databaseIndexes.js';
import {inspectActiveContracts} from './activeContractUpgrade.js';
import {databaseReadinessFail,contractIndexRequirement} from './backupRequirement.js';
export const EXPECTED_SCHEMA_VERSION=2;
export async function databaseModels(){for(const file of await fs.readdir(new URL('../models/',import.meta.url)))if(file.endsWith('.js'))await import(new URL('../models/'+file,import.meta.url));return mongoose.models}
export async function transactionReadiness(db,{probe=false}={}){
 const hello=await db.admin().command({hello:1}),replicaSet=hello.setName||null,topologySupported=!!replicaSet||hello.msg==='isdbgrid';let supported=topologySupported&&!!hello.logicalSessionTimeoutMinutes&&(hello.msg==='isdbgrid'||hello.isWritablePrimary===true),error=null;
 if(probe&&supported){const session=mongoose.connection.getClient().startSession();try{session.startTransaction();await db.collection('propertyassignments').findOne({_id:null},{session});await session.abortTransaction()}catch(e){supported=false;error='An actual transaction could not be started/aborted. Check primary availability and database permissions.'}finally{if(session.inTransaction())await session.abortTransaction().catch(()=>{});await session.endSession()}}
 return {supported,replicaSet,primary:hello.msg==='isdbgrid'||hello.isWritablePrimary===true,topology:hello.msg==='isdbgrid'?'SHARDED':replicaSet?'REPLICA_SET':'STANDALONE',verifiedBy:probe?'SESSION_TRANSACTION_PROBE':'LIVE_HELLO',error};
}
export async function inspectDatabaseReadiness({record=false,probe=false}={}){
 const checkedAt=new Date().toISOString();if(mongoose.connection.readyState!==1)return {ready:false,status:'Administrator Maintenance Required',connection:'DISCONNECTED',expectedSchemaVersion:EXPECTED_SCHEMA_VERSION,checkedAt,issues:['MongoDB is not connected.']};
 const db=mongoose.connection.db,models=await databaseModels(),[transactions,contracts,indexes]=await Promise.all([transactionReadiness(db,{probe}),inspectActiveContracts(db),inspectRequiredIndexes(db,models)]);
 const fingerprint=createHash('sha256').update(JSON.stringify(Object.values(models).map(m=>[m.collection.collectionName,m.schema.indexes()]).sort((a,b)=>a[0].localeCompare(b[0])))).digest('hex');
 const contractReady=contracts.activeIndexPresent&&!contracts.legacyIndexes.length&&!contracts.legacyAccounts&&!contracts.conflicts.length&&!contracts.invalidLifecycles&&!contracts.namedIndexConflict;
 const issues=[];if(!transactions.supported)issues.push(transactions.error||'MongoDB needs a writable replica set or sharded cluster with session transaction support.');
 if(!contractReady)issues.push(contracts.conflicts.length?'Conflicting active contracts require administrator review.':'Active-contract structures require one-time administrator maintenance.');
 if(!indexes.ready)issues.push(`${indexes.missing.length} required index definition(s) need approved setup or maintenance.`);
 let ready=issues.length===0;const previous=await db.collection('rems_schema_state').findOne({_id:'database-readiness'});
 const futureSchema=(previous?.schemaVersion||0)>EXPECTED_SCHEMA_VERSION;if(futureSchema){issues.push('This database has a newer verified schema version. Use a compatible REMS release; automatic downgrade is not allowed.');ready=false}
 if(record&&ready)await db.collection('rems_schema_state').updateOne({_id:'database-readiness'},{$set:{database:db.databaseName,schemaVersion:EXPECTED_SCHEMA_VERSION,expectedFingerprint:fingerprint,lastSuccessfulVerification:checkedAt,verification:'ACTUAL_DATABASE_INSPECTION',transactionProbe:probe}},{upsert:true});
 return {ready,futureSchema,status:ready?'Ready for Operations':'Administrator Maintenance Required',connection:'CONNECTED',database:db.databaseName,transactions,contracts,indexes,contractReady,expectedSchemaVersion:EXPECTED_SCHEMA_VERSION,verifiedSchemaVersion:ready?EXPECTED_SCHEMA_VERSION:previous?.schemaVersion||null,expectedFingerprint:fingerprint,lastSuccessfulVerification:record&&ready?checkedAt:previous?.lastSuccessfulVerification||null,checkedAt,issues,pendingMaintenance:!ready};
}
// Never trusts a stored version or installer report; only real contract requirements block this action.
export async function assertContractOperationsReady(){
 const db=mongoose.connection.db,t=await transactionReadiness(db);if(!t.supported)databaseReadinessFail('This office server needs one-time transaction setup. Open Administration → System Health & Database Readiness. No operation was posted.');
 const s=await inspectActiveContracts(db);if(s.legacyAccounts||s.legacyIndexes.length||!s.activeIndexPresent||s.conflicts.length||s.invalidLifecycles||s.namedIndexConflict)throw contractIndexRequirement(s.conflicts.length?'Conflicting active contracts require administrator review in System Health & Database Readiness. No records were changed.':'The actual active-contract index needs one-time approved maintenance in System Health & Database Readiness. Routine operations do not require a new backup.');
}
