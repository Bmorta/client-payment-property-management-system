import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {restoreConnection} from '../src/services/databaseMaintenance.js';
import {maintenanceWriteGate,withMaintenance,maintenanceActive,trackedBackgroundWrite} from '../src/services/maintenanceGate.js';
import {applyActiveContractUpgrade} from '../src/services/activeContractUpgrade.js';
test('recovery connection removes live namespace and preserves authentication',()=>{
 assert.equal(restoreConnection('mongodb://localhost:27017/rems?replicaSet=rs0'),'mongodb://localhost:27017/?replicaSet=rs0');
 assert.equal(restoreConnection('mongodb://user:secret@localhost:27017/rems'),'mongodb://user:secret@localhost:27017/?authSource=rems');
 assert.equal(restoreConnection('mongodb+srv://user:secret@host/rems?authSource=admin'),'mongodb+srv://user:secret@host/?authSource=admin');assert.throws(()=>restoreConnection('bad'));
});
test('maintenance drains requests and blocks read-triggered reconciliation and writes',async()=>{
 const res=new EventEmitter();let next=0;maintenanceWriteGate({method:'POST',path:'/api/finance/payments'},res,()=>next++);assert.equal(next,1);
 let entered=false;const operation=withMaintenance(async()=>{entered=true;assert.equal(await trackedBackgroundWrite(()=>assert.fail('must not start')),null);throw Error('test failure')});
 assert.equal(maintenanceActive(),true);assert.equal(entered,false);
 for(const method of ['GET','POST']){let status;maintenanceWriteGate({method,path:'/api/clients/accounts'},{status(n){status=n;return this},json(body){assert.equal(body.success,false)}},()=>assert.fail('request started'));assert.equal(status,503)}
 res.emit('finish');await assert.rejects(operation,/test failure/);assert.equal(maintenanceActive(),false);
});
test('migration requires backup reference before accessing database',async()=>{await assert.rejects(applyActiveContractUpgrade({},{}),/backup/)});

import fs from 'node:fs/promises';
import mongoose from 'mongoose';
import {createBackup,assertProtectedMetricsUnchanged} from '../src/services/databaseMaintenance.js';
import {reconcileAll} from '../src/services/monitoringService.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
test('pending non-contract index maintenance pauses scheduled financial snapshots before backup approval',async t=>{
 let scans=0;t.mock.method(PropertyAssignment,'find',()=>{scans++;return {select(){return this},cursor(){return (async function*(){})()}}});
 await reconcileAll({inspect:async()=>({ready:false,contractReady:true,pendingMaintenance:true})});assert.equal(scans,0);
 await reconcileAll({inspect:async()=>({ready:true,contractReady:true,pendingMaintenance:false})});assert.equal(scans,1);
});
test('backup validation ignores collection/property ordering and existing workflow metadata only',()=>{
 const baseline={propertyassignments:{count:1,checksum:'source'},payments:{count:2,checksum:'payments'},activitylogs:{count:1,checksum:'audit'}};
 assert.doesNotThrow(()=>assertProtectedMetricsUnchanged({activitylogs:{count:20,checksum:'new audit'},payments:{checksum:'payments',count:2},propertyassignments:{checksum:'source',count:1}},baseline));
 for(const current of [{...baseline,propertyassignments:{count:1,checksum:'changed financial snapshot'}},{...baseline,payments:{count:3,checksum:'new payment'}},{...baseline,cashledgerentries:{count:1,checksum:'new cash movement'}}])assert.throws(()=>assertProtectedMetricsUnchanged(current,baseline),/Protected database records changed/);
 const {payments,...missing}=baseline;assert.throws(()=>assertProtectedMetricsUnchanged(missing,baseline),/payments/);
});
test('concurrent backup requests are reserved before asynchronous preflight, and failure releases reservation',async t=>{
 let unblock;const gate=new Promise(resolve=>{unblock=resolve});t.mock.method(fs,'stat',async()=>{await gate;throw Object.assign(new Error('No tools in test'),{code:'ENOENT'})});
 const first=createBackup({username:'test'},{singleBackendConfirmed:true});
 await assert.rejects(createBackup({username:'test'},{singleBackendConfirmed:true}),/Another backup, recovery or upgrade/);
 unblock();await assert.rejects(first,/mongodump was not found/);
 await assert.rejects(createBackup({username:'test'},{singleBackendConfirmed:true}),/mongodump was not found/);
});
