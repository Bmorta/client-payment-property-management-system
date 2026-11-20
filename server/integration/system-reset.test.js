import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Project from '../src/models/Project.js';
import Client from '../src/models/Client.js';
import Property from '../src/models/Property.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import Company from '../src/models/Company.js';
import SequenceCounter from '../src/models/SequenceCounter.js';
import ActivityLog from '../src/models/ActivityLog.js';
import MigrationConfig from '../src/models/MigrationConfig.js';
import {databaseModels} from '../src/services/databaseReadiness.js';
import {readJob,readiness} from '../src/services/databaseMaintenance.js';
import {classifyResetCollections,RESET_PHRASE} from '../src/services/systemReset.js';
import {signAccessToken} from '../src/utils/jwt.js';
import {buildSchedule,today} from '../src/utils/accounting.js';

test('full isolated reset requires password, fresh recovery-tested backup and preserves usable office configuration',{skip:!process.env.REMS_RESET_TEST_URI},async()=>{
 // Explicit local disposable replica-set only; never use the office URI or DB.
 const uri=new URL(process.env.REMS_RESET_TEST_URI);
 assert.equal(uri.protocol,'mongodb:');assert.ok(['localhost','127.0.0.1','[::1]'].includes(uri.hostname));
 const dbName='rems_test_reset_'+randomUUID().replaceAll('-','');uri.pathname='/'+dbName;
 process.env.MONGODB_URI=uri.toString();process.env.JWT_SECRET='isolated-reset-integration-test';
 const folder=await mkdtemp(path.join(os.tmpdir(),'rems-reset-test-'));process.env.REMS_BACKUP_DIR=folder;
 await mongoose.connect(uri.toString(),{dbName});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const targets=[],tokens={},password='Test-reset-password-only-2026';
 const api=async(endpoint,method='GET',body,role='ADMIN',expected=200)=>{
  const r=await fetch('http://127.0.0.1:'+server.address().port+'/api'+endpoint,{method,headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));return data;
 };
 const waitFor=async(id,state)=>{for(let i=0;i<600;i++){const job=await readJob(id);if(job.state===state&&!(await readiness()).jobRunning)return job;if(['FAILED','RECOVERY_FAILED','INTERRUPTED'].includes(job.state))assert.fail(job.error||job.state);await new Promise(r=>setTimeout(r,100))}assert.fail('Backup did not finish');};
 try{
  const models=await databaseModels();await Promise.all(Object.values(models).map(m=>m.init()));
  let admin;for(const role of ['ADMIN','STAFF','VIEWER']){const user=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Test',email:role+'@test.local',passwordHash:await bcrypt.hash(password,10),role});tokens[role]=signAccessToken(user);if(role==='ADMIN')admin=user;}
  await ActivityLog.create({action:'TEST_ACTIVITY',username:admin.username,userId:admin._id});
  const project=await Project.create({projectId:'PRJ-TEST',projectCode:'TEST',projectName:'Test project',createdBy:admin._id});
  const property=await Property.create({propertyId:'PROP-TEST',project:project._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:1000,createdBy:admin._id});
  const client=await Client.create({clientId:'CL-TEST',firstName:'Test',lastName:'Buyer',createdBy:admin._id,status:'ACTIVE'});
  const day=today(),schedule=buildSchedule(10000000,12,day,1000000,day);
  await PropertyAssignment.create({assignmentId:'CTR-TEST',client:client._id,project:project._id,property:property._id,createdBy:admin._id,contract:{totalCents:10000000,months:12,contractDate:day,firstDueDate:day,downPaymentCents:1000000,schedule}});
  await Company.create({companyId:'CMP-TEST',name:'Keep Company',projects:[project._id],createdBy:admin._id});
  await MigrationConfig.create({_id:'OFFICE',cutoffDate:day,stagingStarted:true,activationSequence:7,backupReference:'old',recoveryTestReference:'old'});
  await SequenceCounter.create({_id:'client',value:99});
  const scope=classifyResetCollections(models,[]),db=mongoose.connection.db;
  for(const item of scope.deletion)if(await db.collection(item.name).countDocuments({})===0)await db.collection(item.name).insertOne({_id:new mongoose.Types.ObjectId(),testMarker:true});
  for(const role of ['STAFF','VIEWER']){await api('/maintenance/system-reset/preview','GET',undefined,role,403);await api('/maintenance/system-reset','POST',{},role,403);}
  const preview=(await api('/maintenance/system-reset/preview')).data;assert.ok(preview.canReset);assert.ok(preview.total>=scope.deletion.length);
  await api('/maintenance/system-reset','POST',{confirm:true,singleBackendConfirmed:true,confirmation:RESET_PHRASE,password:'wrong',backupId:'fake'},'ADMIN',403);
  const prepare=async()=>{
   const p=(await api('/maintenance/system-reset/preview')).data;
   const started=await api('/maintenance/system-reset/backup','POST',{database:p.database,token:p.token,confirm:true,singleBackendConfirmed:true},'ADMIN',202);
   const id=started.data.id;await waitFor(id,'FILE_VERIFIED');
   const recovery=await api('/maintenance/backups/'+id+'/recovery-test','POST',{confirm:true},'ADMIN',202);targets.push(recovery.data.target);await waitFor(id,'RECOVERY_VERIFIED');
   return (await api('/maintenance/system-reset/preview?backupId='+id)).data;
  };
  const stale=await prepare();
  await Client.updateOne({_id:client._id},{$set:{firstName:'Changed after backup'}});
  await api('/maintenance/system-reset','POST',{backupId:stale.backup.id,token:stale.token,database:dbName,confirmation:RESET_PHRASE,password,confirm:true,singleBackendConfirmed:true},'ADMIN',409);
  assert.equal(await Client.countDocuments(),1);assert.equal(await PropertyAssignment.countDocuments(),1);
  const reviewed=await prepare();
  const reset=await api('/maintenance/system-reset','POST',{backupId:reviewed.backup.id,token:reviewed.token,database:dbName,confirmation:RESET_PHRASE,password,confirm:true,singleBackendConfirmed:true});
  assert.equal(reset.data.totalDeleted,reviewed.total);
  for(const item of scope.deletion)assert.equal(await db.collection(item.name).countDocuments({}),0,item.name);
  assert.equal(await User.countDocuments(),3);assert.equal((await Company.findOne()).name,'Keep Company');assert.deepEqual((await Company.findOne()).projects,[]);
  assert.equal((await SequenceCounter.findById('client')).value,99);assert.equal((await MigrationConfig.findById('OFFICE')).stagingStarted,false);
  assert.ok(await ActivityLog.exists({action:'SYSTEM_DATA_RESET',outcome:'SUCCEEDED'}));
  const login=await api('/auth/login','POST',{identifier:admin.username,password});assert.ok(login.data.token);tokens.ADMIN=login.data.token;
  await api('/finance/reports/dashboard/overview');
  const fresh=(await api('/projects','POST',{projectName:'Fresh office project',projectCode:'FRESH'},'ADMIN',201)).data;
  const buyer=(await api('/clients','POST',{firstName:'Fresh',lastName:'Buyer'},'ADMIN',201)).data;
  const lot=await Property.create({propertyId:'PROP-FRESH',project:fresh._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:1000,createdBy:admin._id});
  const contract=(await api('/clients/'+buyer._id+'/assignments','POST',{propertyId:String(lot._id),months:12,downPayment:10000,contractDate:day,firstDueDate:day},'ADMIN',201)).data;
  assert.equal(contract.contract.totalCents,10000000);assert.equal(contract.contract.schedule.reduce((n,r)=>n+r.amountCents,0),10000000);
 }finally{
  server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  // Cleanup only unique disposable namespaces generated by this test.
  for(const name of [dbName,...targets])if(name===dbName||/^rems_recovery_[a-f0-9]{32}$/.test(name)){const db=mongoose.connection.getClient().db(name);for(const {name:collection} of await db.listCollections({},{nameOnly:true}).toArray())await db.dropCollection(collection);}
  await mongoose.disconnect();await rm(folder,{recursive:true,force:true});
 }
});
