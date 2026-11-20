import test from 'node:test';
import assert from 'node:assert/strict';
import {databaseModels} from '../src/services/databaseReadiness.js';
import {classifyResetCollections,identifiedResetDatabase,applyResetPlan,executeSystemReset,RESET_PHRASE} from '../src/services/systemReset.js';
import {assertResetMetricsUnchanged,withExclusiveDatabaseMaintenance} from '../src/services/databaseMaintenance.js';
import {maintenanceWriteGate,maintenanceActive} from '../src/services/maintenanceGate.js';
import User from '../src/models/User.js';

test('reset scope classifies all installed models and preserves authentication, audit and initialization',async()=>{
 const models=await databaseModels(),collections=Object.values(models).map(m=>({name:m.collection.collectionName,type:'collection'}));
 const plan=classifyResetCollections(models,[...collections,{name:'rems_schema_state'},{name:'rems_installation'}]);
 assert.deepEqual(plan.unknown,[]);
 assert.equal(plan.deletion.length+plan.preserved.length,Object.keys(models).length);
 for(const model of ['User','ActivityLog','SequenceCounter','AdministrationGuard','Company','MigrationConfig','ReservationSettings','SiteRequestSettings'])assert.ok(plan.preserved.some(r=>r.model===model));
 for(const model of ['PropertyAssignment','Reservation','ReceiptClaim','PaymentBatch','CashLedgerEntry','RefundRelease','CommissionVoucher','PenaltyCycleIdentity','SalesPlanningRecord','MigrationDocument'])assert.ok(plan.deletion.some(r=>r.model===model));
 assert.ok(classifyResetCollections(models,[...collections,{name:'unreviewed_collection'}]).unknown.includes('unreviewed_collection'));
 assert.ok(classifyResetCollections(models,[{name:'projects',type:'view'}]).unknown.includes('projects'));
});
test('reset database identity requires an explicit matching namespace and rejects recovery/system databases',()=>{
 assert.equal(identifiedResetDatabase('property_management','mongodb://localhost:27017/property_management?replicaSet=rs0'),'property_management');
 for(const [name,uri] of [['test','mongodb://localhost:27017'],['other','mongodb://localhost:27017/property_management'],['admin','mongodb://localhost:27017/admin'],['rems_recovery_abc','mongodb://localhost:27017/rems_recovery_abc'],['','mongodb://localhost:27017/']])assert.throws(()=>identifiedResetDatabase(name,uri),/identified/);
});
test('reset verification covers migration metadata and rejects same-count content changes',()=>{
 const expected={migrationbatches:{count:1,checksum:'a'},migrationconfigs:{count:1,checksum:'b'},clients:{count:2,checksum:'c'}};
 assert.doesNotThrow(()=>assertResetMetricsUnchanged(expected,expected,Object.keys(expected)));
 assert.throws(()=>assertResetMetricsUnchanged({...expected,migrationbatches:{count:1,checksum:'changed'}},expected,Object.keys(expected)),/migrationbatches/);
 assert.throws(()=>assertResetMetricsUnchanged({...expected,migrationconfigs:{count:0,checksum:'changed'}},expected,Object.keys(expected)),/migrationconfigs/);
});
test('reset denies missing confirmation and incorrect administrator password before accessing the data scope',async t=>{
 await assert.rejects(executeSystemReset('507f1f77bcf86cd799439011',{}),/Explicit reset approval/);
 const find=t.mock.method(User,'findById',()=>({select:async()=>({_id:'507f1f77bcf86cd799439011',isActive:true,role:'ADMIN',comparePassword:async()=>false})}));
 await assert.rejects(executeSystemReset('507f1f77bcf86cd799439011',{confirm:true,singleBackendConfirmed:true,confirmation:RESET_PHRASE,backupId:'not-used',password:'wrong'}),/password verification failed/);
 assert.equal(find.mock.callCount(),1);
 assert.equal(maintenanceActive(),false);
});
test('reset lock excludes competing maintenance mutations and releases on failure',async()=>{
 let unblock;const wait=new Promise(r=>{unblock=r});
 const work=withExclusiveDatabaseMaintenance(async()=>{await wait;throw Error('aborted')});
 assert.equal(maintenanceActive(),true);
 let status;maintenanceWriteGate({method:'POST',path:'/api/maintenance/backups'},{status(n){status=n;return this},json(){}},()=>assert.fail('Maintenance write started'));
 assert.equal(status,503);
 await assert.rejects(withExclusiveDatabaseMaintenance(()=>assert.fail('Concurrent maintenance started')),/Another backup/);
 unblock();await assert.rejects(work,/aborted/);assert.equal(maintenanceActive(),false);
});
test('dependency-aware reset deletes only approved collections and verifies counts; preserved records stay untouched',async()=>{
 const models=await databaseModels(),scope=classifyResetCollections(models,[]);
 const counts=new Map(scope.deletion.map(r=>[r.name,r.model==='Client'?2:0]));
 const plan={deletion:scope.deletion.map(r=>({...r,present:true,count:counts.get(r.name)})),updates:scope.preserved.filter(r=>['Company','MigrationConfig'].includes(r.model)).map(r=>({...r,count:0}))};
 const session={test:true},calls=[];
 const db={collection(name){return {async countDocuments(_filter,options){assert.equal(options.session,session);return counts.get(name)},async deleteMany(filter,options){assert.deepEqual(filter,{});assert.equal(options.session,session);calls.push(name);const deletedCount=counts.get(name);counts.set(name,0);return {deletedCount}}}}};
 const result=await applyResetPlan(db,session,plan,{username:'test-admin'},'RESET-test');
 assert.equal(result.reduce((n,r)=>n+r.count,0),2);
 assert.deepEqual(calls,scope.deletion.map(r=>r.name));
 for(const row of scope.preserved)assert.ok(!calls.includes(row.name));
 const invalid={...plan,deletion:plan.deletion.map((r,i)=>i? r:{...r,name:models.User.collection.collectionName})};
 await assert.rejects(applyResetPlan(db,session,invalid,{},'RESET-test'),/allowlist mismatch/);
});
test('a stale deletion count or mismatched deleted count fails the transaction callback',async()=>{
 const scope=classifyResetCollections(await databaseModels(),[]),plan={deletion:scope.deletion.map(r=>({...r,present:true,count:1})),updates:scope.preserved.filter(r=>['Company','MigrationConfig'].includes(r.model)).map(r=>({...r,count:0}))};
 const db={collection(){return {countDocuments:async()=>1,deleteMany:async()=>({deletedCount:0})}}};
 await assert.rejects(applyResetPlan(db,{},plan,{},'RESET-test'),/deletion verification failed/);
});
