import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Client from '../src/models/Client.js';
import Project from '../src/models/Project.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import MigrationBatch from '../src/models/MigrationBatch.js';
import CashLedgerEntry from '../src/models/CashLedgerEntry.js';
import {buildSchedule} from '../../shared/paymentSchedule.js';
import {signAccessToken} from '../src/utils/jwt.js';

test('archive/status filters, protected draft deletion and complete cash-history pagination',{skip:!process.env.CPM_CONTROLS_TEST_URI},async()=>{
 await mongoose.connect(process.env.CPM_CONTROLS_TEST_URI,{dbName:'cpm_controls_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='controls-test';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  const users={},tokens={};for(const role of ['ADMIN','STAFF','VIEWER']){users[role]=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Controls',email:role+'@test.local',passwordHash:'unused',role});tokens[role]=signAccessToken(users[role]);}
  const api=async(path,method='GET',body,role='ADMIN',status=200)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data;};
  const staffBefore=await User.findById(users.STAFF._id).lean();await api(`/users/${users.STAFF._id}`,'PATCH',{isActive:false});assert.equal((await api('/users?status=INACTIVE')).length,1);await api(`/users/${users.STAFF._id}`,'PATCH',{isActive:true});assert.equal((await User.findById(users.STAFF._id)).firstName,staffBefore.firstName);assert.equal((await api('/users?status=INACTIVE')).length,0);
  const project=await api('/projects','POST',{projectName:'Review Project',projectCode:'RVW',status:'ACTIVE'},'ADMIN',201),client=await api('/clients','POST',{firstName:'Review',lastName:'Client'},'STAFF',201);
  await api(`/projects/${project._id}/archive`,'PATCH',{},'VIEWER',403);await api(`/projects/${project._id}/archive`,'PATCH',{});assert.equal((await api('/projects?status=ARCHIVED')).length,1);assert.equal((await api('/projects?status=ACTIVE')).length,0);await api(`/projects/${project._id}`,'PUT',{status:'ACTIVE'});assert.equal((await api('/projects?status=ACTIVE')).length,1);
  await api(`/clients/${client._id}`,'PUT',{status:'INACTIVE'},'VIEWER',403);await api(`/clients/${client._id}`,'PUT',{status:'INACTIVE'},'STAFF');assert.equal((await api('/clients?status=INACTIVE&limit=25')).length,1);assert.equal((await api('/clients?status=ACTIVE&limit=25')).length,0);await api(`/clients/${client._id}`,'PUT',{status:'ACTIVE'});assert.equal((await Client.findById(client._id)).status,'ACTIVE');await api('/clients?status=INVALID','GET',null,'ADMIN',400);
  const a=await PropertyAssignment.create({assignmentId:'CTR-DRAFT',client:client._id,project:project._id,property:new mongoose.Types.ObjectId(),createdBy:users.ADMIN._id,contract:{totalCents:1200000,downPaymentCents:0,months:2,contractDate:'2026-08-01',firstDueDate:'2026-08-05',schedule:buildSchedule(1200000,2,'2026-08-05',0,'2026-08-01')},payments:[]});
  const original=await PropertyAssignment.findById(a._id).lean();let batch=await api('/migration/batches','POST',{accountId:String(a._id)},'STAFF');batch=await api(`/migration/batches/${batch._id}`,'PATCH',{version:batch.__v,action:'UPSERT_ROW',row:{kind:'PAYMENT',date:'2026-08-05',receiptNumber:'DRAFT-ONLY',type:'INSTALLMENT',method:'CASH',amount:6000}},'STAFF');const rowId=batch.rows[0].rowId;batch=await api(`/migration/batches/${batch._id}`,'PATCH',{version:batch.__v,action:'DELETE_ROW',rowId},'STAFF');assert.equal(batch.rows.length,0);assert.deepEqual(await PropertyAssignment.findById(a._id).lean(),original);assert.ok(batch.history.some(h=>h.event==='DELETE_ROW'));
  await MigrationBatch.collection.updateOne({_id:new mongoose.Types.ObjectId(batch._id)},{$set:{status:'COMPLETED'}});await api(`/migration/batches/${batch._id}`,'PATCH',{version:batch.__v,action:'DELETE_ROW',rowId},'ADMIN',409);
  await CashLedgerEntry.init();await CashLedgerEntry.insertMany(Array.from({length:205},(_,i)=>({entryId:'CASH-'+String(i).padStart(4,'0'),requestId:randomUUID(),kind:'INFLOW',effectiveDate:'2026-11-02',amountCents:100,reason:'Verified retained collection',createdBy:users.ADMIN._id,status:i===0?'VOIDED':'POSTED'})));
  const first=await api('/finance/cash-ledger?paged=1&limit=25&page=1'),last=await api('/finance/cash-ledger?paged=1&limit=25&page=9');assert.equal(first.count,205);assert.equal(first.rows.length,25);assert.equal(last.rows.length,5);assert.equal((await api('/finance/cash-ledger?paged=1&status=POSTED')).count,204);assert.equal((await api('/finance/cash-ledger?paged=1&status=VOIDED')).count,1);assert.equal((await api('/finance/cash-ledger?paged=1&q=.*')).count,0);assert.equal((await api('/finance/expenses?paged=1&q=%5B')).count,0);assert.equal((await api('/finance/cash-ledger?paged=1&from=2026-11-03')).count,0);await api('/finance/cash-ledger?paged=1&limit=3','GET',null,'ADMIN',400);assert.equal(await CashLedgerEntry.countDocuments(),205);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
