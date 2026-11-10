import {spawn} from 'node:child_process';
import os from 'node:os';import path from 'node:path';import fs from 'node:fs/promises';
import test from 'node:test';import assert from 'node:assert/strict';import mongoose from 'mongoose';import {randomUUID} from 'node:crypto';
import {inspectDatabaseReadiness,EXPECTED_SCHEMA_VERSION,assertContractOperationsReady,databaseModels} from '../src/services/databaseReadiness.js';
import {schemaMaintenancePlan,applyReviewedSchema} from '../src/services/schemaMaintenance.js';
import {inspectActiveContracts} from '../src/services/activeContractUpgrade.js';
import {matchesIndex} from '../../shared/databaseIndexes.js';
import {upgradePreview,approveUpgrade,readiness} from '../src/services/databaseMaintenance.js';
import Account from '../src/models/PropertyAssignment.js';
import {buildSchedule} from '../../shared/paymentSchedule.js';
test('actual schema readiness, approved initialization, legacy repair, equivalents, conflicts and restart verification',{skip:!process.env.REMS_READINESS_TEST_URI},async()=>{
 await mongoose.connect(process.env.REMS_READINESS_TEST_URI,{autoCreate:false,autoIndex:false,dbName:'readiness_'+randomUUID().replaceAll('-','')});const db=mongoose.connection.db;
 try{
 let state=await inspectDatabaseReadiness({probe:true});assert.equal(state.ready,false);assert.ok(state.indexes.missing.length>0);assert.equal((await db.listCollections({},{nameOnly:true}).toArray()).length,0,'inspection must not create collections/indexes');
 if(process.env.REMS_READINESS_STANDALONE==='true'){assert.equal(state.transactions.supported,false);await assert.rejects(assertContractOperationsReady,/transaction setup/);return}
 assert.equal(state.transactions.supported,true);
 // Empty setup is approved explicitly and needs no backup. Ordinary startup never calls this.
 let plan=await schemaMaintenancePlan();assert.equal(plan.populated,false);assert.equal(plan.requiresBackup,false);assert.equal(plan.canApply,true);
 await applyReviewedSchema(plan);state=await inspectDatabaseReadiness({record:true,probe:true});assert.equal(state.ready,true);assert.equal(state.verifiedSchemaVersion,EXPECTED_SCHEMA_VERSION);
 const first=await db.collection('rems_schema_state').findOne({_id:'database-readiness'});assert.ok(first.lastSuccessfulVerification);
 await assertContractOperationsReady();await assertContractOperationsReady();
 // A named equivalent is sufficient, including the explicit $eq form.
 const col=db.collection('propertyassignments');await col.dropIndex('active_property_contract');await col.createIndex({property:1},{name:'office_custom_active',unique:true,partialFilterExpression:{lifecycle:{$eq:'ACTIVE'}}});state=await inspectDatabaseReadiness();assert.equal(state.ready,true);assert.equal(state.indexes.equivalent.some(i=>i.actualName==='office_custom_active'),true);
 // Start the actual server twice against this disposable ready database.
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'rems-startup-test-'));const startupUri=new URL(process.env.REMS_READINESS_TEST_URI);startupUri.pathname='/'+db.databaseName;
 try{for(let restart=0;restart<2;restart++)await new Promise((resolve,reject)=>{let output='';const child=spawn(process.execPath,['src/server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,MONGODB_URI:startupUri.toString(),JWT_SECRET:'test-only',PORT:'0',HOST:'127.0.0.1',NODE_ENV:'production',REMS_BACKUP_DIR:temp,FINANCIAL_BACKUP_DIR:temp},stdio:['ignore','pipe','pipe']});const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Startup timed out: '+output))},15000);const collect=b=>{output+=b.toString();if(output.includes('API listening on port'))child.kill('SIGTERM')};child.stdout.on('data',collect);child.stderr.on('data',collect);child.once('error',reject);child.once('exit',code=>{clearTimeout(timeout);try{assert.match(output,/Database readiness: Ready for Operations/);assert.doesNotMatch(output,/needs administrator review|No migration ran/);assert.equal(code,0);resolve()}catch(e){reject(e)}})})}finally{await fs.rm(temp,{recursive:true,force:true})}
 // New backend connection recognises actual readiness; no backup history is needed.
 const uri=process.env.REMS_READINESS_TEST_URI,name=db.databaseName;await mongoose.disconnect();await mongoose.connect(uri,{dbName:name,autoCreate:false,autoIndex:false});await assertContractOperationsReady();assert.equal((await inspectDatabaseReadiness({record:true,probe:true})).ready,true);
 const database=mongoose.connection.db,accounts=database.collection('propertyassignments');
 const id1=new mongoose.Types.ObjectId(),property=new mongoose.Types.ObjectId();
 await accounts.insertOne({_id:id1,assignmentId:'CTR-LEGACY',client:new mongoose.Types.ObjectId(),property,contract:{totalCents:1200000,months:12,contractDate:'2026-01-01',schedule:buildSchedule(1200000,12,'2026-01-05')},payments:[{paymentId:'PAY-ORIGINAL',amountCents:10000}],commissionPayouts:[{payoutId:'PAYOUT-ORIGINAL',amountCents:1000}]});
 const original=await accounts.findOne({_id:id1});await accounts.createIndex({property:1},{name:'property_1',unique:true});
 state=await inspectDatabaseReadiness();assert.equal(state.ready,false);assert.equal(state.verifiedSchemaVersion,EXPECTED_SCHEMA_VERSION,'stored version must not hide drift');
 plan=await schemaMaintenancePlan();assert.equal(plan.populated,true);assert.equal(plan.requiresBackup,true);assert.equal(plan.conflicts.length,0);await assert.rejects(()=>applyReviewedSchema(plan),/requires a recovery-verified backup/);
 await assert.rejects(()=>approveUpgrade(null,{username:'admin'},{singleBackendConfirmed:true,token:'stale',confirmation:'APPLY ACTIVE CONTRACT UPGRADE'}),/preview changed/);
 // Fixture-only approved executor: API separately validates managed backup identity/hash/recovery.
 await applyReviewedSchema(plan,{backupReference:'DISPOSABLE_TEST_APPROVAL_ONLY'});
 assert.equal((await inspectDatabaseReadiness({record:true,probe:true})).ready,true);assert.deepEqual((await accounts.findOne({_id:id1})).payments,original.payments);assert.deepEqual((await accounts.findOne({_id:id1})).commissionPayouts,original.commissionPayouts);assert.equal((await accounts.findOne({_id:id1})).lifecycle,'ACTIVE');
 let indexNames=(await accounts.indexes()).map(i=>i.name);assert.ok(indexNames.includes('office_custom_active'));assert.ok(!indexNames.includes('active_property_contract'));assert.ok(!indexNames.includes('property_1'));
 await assertContractOperationsReady();plan=await schemaMaintenancePlan();assert.equal(plan.schema.ready,true);assert.equal(plan.requiresBackup,false);
 await database.collection('rems_schema_state').updateOne({_id:'database-readiness'},{$set:{schemaVersion:EXPECTED_SCHEMA_VERSION+1}});state=await inspectDatabaseReadiness({record:true});assert.equal(state.ready,false);assert.equal(state.futureSchema,true);assert.equal((await schemaMaintenancePlan()).canApply,false);assert.equal((await database.collection('rems_schema_state').findOne({_id:'database-readiness'})).schemaVersion,EXPECTED_SCHEMA_VERSION+1);await database.collection('rems_schema_state').updateOne({_id:'database-readiness'},{$set:{schemaVersion:EXPECTED_SCHEMA_VERSION}});
 // An index removed after verification is discovered; a historical Ready flag never bypasses it.
 await accounts.dropIndex('office_custom_active');await accounts.insertOne({_id:new mongoose.Types.ObjectId(),assignmentId:'CTR-CONFLICT',client:new mongoose.Types.ObjectId(),property,lifecycle:'ACTIVE'});
 state=await inspectDatabaseReadiness();assert.equal(state.ready,false);assert.equal(state.contracts.conflicts.length,1);await assert.rejects(assertContractOperationsReady,/Conflicting active contracts/);
 plan=await schemaMaintenancePlan();assert.equal(plan.canApply,false);await assert.rejects(()=>applyReviewedSchema(plan,{backupReference:'TEST'}),/Resolve topology/);assert.equal(await accounts.countDocuments(),2);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect()}
});
