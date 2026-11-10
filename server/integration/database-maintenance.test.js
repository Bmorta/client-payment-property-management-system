import {inspectDatabaseReadiness} from '../src/services/databaseReadiness.js';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import User from '../src/models/User.js';
import {signAccessToken} from '../src/utils/jwt.js';
import {readiness,createBackup,readJob,recoveryTest,upgradePreview,approveUpgrade,assertEligibleBackup,backupOptions} from '../src/services/databaseMaintenance.js';
test('isolated full backup, recovery, authorization, approved migration and preserved financial data',{skip:!process.env.REMS_MAINTENANCE_TEST_URI},async()=>{
 const dbName='maintenance_'+randomUUID().replaceAll('-',''),uri=process.env.REMS_MAINTENANCE_TEST_URI;
 await mongoose.connect(uri,{dbName,autoIndex:false,autoCreate:false});const u=new URL(uri);u.pathname='/'+dbName;process.env.MONGODB_URI=u.toString();process.env.JWT_SECRET='disposable-maintenance-test';process.env.REMS_BACKUP_DIR=await mkdtemp(path.join(os.tmpdir(),'rems-maintenance-'));
 let target;const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const wait=async(id,states)=>{for(let i=0;i<300;i++){const j=await readJob(id);if(states.includes(j.state))return j;if(['FAILED','RECOVERY_FAILED','UPGRADE_REVIEW_REQUIRED'].includes(j.state))assert.fail(JSON.stringify(j));await new Promise(r=>setTimeout(r,100))}assert.fail('Job did not finish')};
 try{
 const db=mongoose.connection.db,c=db.collection('propertyassignments'),original={assignmentId:'LEGACY',property:new mongoose.Types.ObjectId(),payments:[{receiptNumber:'KEEP',amountCents:12345}],commissionPayouts:[{payoutId:'KEEP-PAYOUT',amountCents:300}]};await c.insertOne(original);await c.createIndex({property:1},{name:'property_1',unique:true});
 const tokens={};for(const role of ['ADMIN','STAFF','VIEWER']){const user=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Test',email:role+'@test.local',passwordHash:'unused',role});tokens[role]=signAccessToken(user)}
 const before=await c.findOne();const indexes=await c.indexes();const status=await readiness();assert.equal(status.preview.legacyAccounts,1);await upgradePreview();assert.deepEqual(await c.findOne(),before);assert.deepEqual(await c.indexes(),indexes);
 for(const role of ['STAFF','VIEWER'])for(const endpoint of ['/status','/backup-options','/financial-restore-points','/identifiers/preview?mode=CLIENT_IDS']){const r=await fetch(`http://127.0.0.1:${server.address().port}/api/maintenance${endpoint}`,{headers:{Authorization:'Bearer '+tokens[role]}});assert.equal(r.status,403)}
 await assert.rejects(createBackup({username:'admin'},{}),/Confirm/);
 const id=await createBackup({username:'test-admin'},{singleBackendConfirmed:true});const backed=await wait(id,['FILE_VERIFIED']);assert.ok(backed.bsonFiles>=2);assert.deepEqual(await c.findOne(),before);
 await assert.rejects(recoveryTest(id,{},{}),/Approve/);
 const recovery=await recoveryTest(id,{username:'test-admin'},{confirm:true});target=recovery.target;assert.notEqual(target,dbName);await wait(id,['RECOVERY_VERIFIED']);assert.deepEqual(await c.findOne(),before);
 const proof=await assertEligibleBackup(id);assert.equal(proof.id,id);assert.equal((await backupOptions())[0].id,id);
 const savedEnvironment=process.env.REMS_ENVIRONMENT;process.env.REMS_ENVIRONMENT='different-test-environment';await assert.rejects(assertEligibleBackup(id),/environment/);if(savedEnvironment===undefined)delete process.env.REMS_ENVIRONMENT;else process.env.REMS_ENVIRONMENT=savedEnvironment;
 const savedUri=process.env.MONGODB_URI;process.env.MONGODB_URI+='?appName=different-binding';await assert.rejects(assertEligibleBackup(id),/different server/);process.env.MONGODB_URI=savedUri;
 const job=await readJob(id),file=path.join(job.dumpDir,Object.keys(job.files).find(n=>n.endsWith('.bson'))),bytes=await readFile(file);await writeFile(file,Buffer.concat([bytes,Buffer.from([0])]));await assert.rejects(assertEligibleBackup(id),/changed after verification/);await writeFile(file,bytes);
 await assertEligibleBackup(id);await c.createIndex({assignmentId:1},{name:'test_index_drift'});await assert.rejects(assertEligibleBackup(id),/indexes changed/);await c.dropIndex('test_index_drift');await assertEligibleBackup(id);
 await assert.rejects(promisify(execFile)(process.execPath,['src/scripts/upgradeLotTransferIndex.js','--apply','--single-backend-confirmed','--backup-reference=FREE-TEXT-IS-NOT-PROOF'],{cwd:new URL('../',import.meta.url),env:process.env}),e=>e.code===1);assert.deepEqual(await c.findOne(),before);
 await assert.rejects(approveUpgrade(id,{},{singleBackendConfirmed:true}),/phrase/);const preview=await upgradePreview();await approveUpgrade(id,{username:'test-admin'},{singleBackendConfirmed:true,token:preview.token,confirmation:'APPLY ACTIVE CONTRACT UPGRADE'});const applied=await wait(id,['UPGRADED']);assert.equal(applied.upgradeResult.after.legacyAccounts,0);assert.equal(applied.upgradeResult.after.activeIndexPresent,true);const after=await c.findOne();assert.equal(after.lifecycle,'ACTIVE');assert.deepEqual(after.payments,original.payments);assert.deepEqual(after.commissionPayouts,original.commissionPayouts);assert.ok(!(await c.indexes()).some(i=>i.name==='property_1'));await assert.rejects(assertEligibleBackup(id),/changed since/);
 const refreshed=await createBackup({username:'test-admin'},{singleBackendConfirmed:true});await wait(refreshed,['FILE_VERIFIED']);const second=await recoveryTest(refreshed,{username:'test-admin'},{confirm:true});try{await wait(refreshed,['RECOVERY_VERIFIED']);await inspectDatabaseReadiness({record:true,probe:true});assert.equal((await assertEligibleBackup(refreshed)).id,refreshed,'nonfinancial verification must not invalidate a matching protected backup')}finally{await mongoose.connection.getClient().db(second.target).dropDatabase()}

 }finally{if(target)await mongoose.connection.getClient().db(target).dropDatabase();await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));await rm(process.env.REMS_BACKUP_DIR,{recursive:true,force:true})}
});

test('centralized identifier preview/apply, duplicate prevention, restore-point history and source freshness',{skip:!process.env.REMS_MAINTENANCE_TEST_URI},async()=>{
 const {identifierPreview,applyIdentifierMaintenance}=await import('../src/services/identifierMaintenance.js');const {createRestorePoint,listFinancialRestorePoints}=await import('../src/services/restorePoint.js');
 const dbName='identifier_'+randomUUID().replaceAll('-',''),uri=process.env.REMS_MAINTENANCE_TEST_URI;await mongoose.connect(uri,{dbName,autoIndex:false,autoCreate:false});const u=new URL(uri);u.pathname='/'+dbName;process.env.MONGODB_URI=u.toString();const folder=await mkdtemp(path.join(os.tmpdir(),'rems-id-test-'));process.env.REMS_BACKUP_DIR=folder;process.env.FINANCIAL_BACKUP_DIR=path.join(folder,'financial');let target;
 const wait=async(id,state)=>{for(let i=0;i<300;i++){const job=await readJob(id);if(job.state===state)return job;if(job.error)assert.fail(job.error);await new Promise(r=>setTimeout(r,100))}assert.fail('Timeout')};
 try{
 const c=mongoose.connection.db.collection('clients'),first={firstName:'Existing',lastName:'Buyer',clientId:'CL-000020'},second={firstName:'Legacy',lastName:'Buyer'};await c.insertMany([first,second]);
 const p=await identifierPreview('CLIENT_IDS');assert.equal(p.total,1);assert.equal(p.canApply,true);assert.equal((await c.findOne({_id:second._id})).clientId,undefined);
 await assert.rejects(applyIdentifierMaintenance({mode:'CLIENT_IDS',token:p.token,requestId:randomUUID(),confirm:true,singleBackendConfirmed:true},{}),/Select a recovery/);
 const point=await createRestorePoint({label:'disposable-test'}),history=await listFinancialRestorePoints();assert.equal(history.rows[0].id,point.id);assert.equal(history.rows[0].status,'VERIFIED_AT_CREATION');
 const id=await createBackup({username:'test-admin'},{singleBackendConfirmed:true});await wait(id,'FILE_VERIFIED');await assert.rejects(assertEligibleBackup(id),/isolated recovery/);target=(await recoveryTest(id,{username:'test-admin'},{confirm:true})).target;await wait(id,'RECOVERY_VERIFIED');
 const body={mode:'CLIENT_IDS',token:p.token,backupId:id,requestId:randomUUID(),confirm:true,singleBackendConfirmed:true};const result=await applyIdentifierMaintenance(body,{username:'test-admin'});assert.equal(result.changed,1);assert.equal((await applyIdentifierMaintenance(body,{})).alreadyApplied,true);assert.equal((await c.findOne({_id:first._id})).clientId,'CL-000020');assert.equal((await c.findOne({_id:second._id})).clientId,'CL-000021');
 await c.insertOne({firstName:'Another',lastName:'Legacy'});const fresh=await identifierPreview('CLIENT_IDS');await assert.rejects(applyIdentifierMaintenance({...body,token:fresh.token,requestId:randomUUID()},{}),/changed since/);assert.equal((await identifierPreview('CLIENT_IDS')).total,1);
 await c.insertOne({firstName:'Conflicting',clientId:'CL-000020'});assert.equal((await identifierPreview('INTERNAL_IDS')).canApply,false);assert.equal((await identifierPreview('CLIENT_IDS')).conflicts.length,1);
 }finally{if(target)await mongoose.connection.getClient().db(target).dropDatabase();await mongoose.connection.dropDatabase();await mongoose.disconnect();await rm(folder,{recursive:true,force:true});delete process.env.FINANCIAL_BACKUP_DIR}
});
