import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {databaseModels} from '../src/services/databaseReadiness.js';
import {restoreScope,replaceRestoreCollection,executeSystemRestore,RESTORE_PHRASE} from '../src/services/systemRestore.js';
import {digestCollection} from '../src/services/databaseMaintenance.js';
import {maintenanceActive} from '../src/services/maintenanceGate.js';
import User from '../src/models/User.js';

test('restore scope restores linked financial and configuration data but preserves authentication, audit and counters',async()=>{
 const models=await databaseModels(),scope=restoreScope(models,[]);
 for(const name of ['User','ActivityLog','SequenceCounter','AdministrationGuard'])assert.ok(scope.preserved.includes(models[name].collection.collectionName));
 for(const model of ['Client','PropertyAssignment','CashLedgerEntry','Company','MigrationConfig','PaymentBatch','CommissionVoucher'])assert.ok(scope.rows.some(r=>r.model===model));
 assert.equal(scope.rows.length+scope.preserved.length,Object.keys(models).length+2);
 assert.throws(()=>restoreScope(models,[{name:'unknown'}]),/Unknown/);
});
test('restore replaces instead of appending and preserves BSON types; checksum mismatch aborts',async()=>{
 const bson=mongoose.mongo.BSON,session={test:true};
 const documents=[{_id:new mongoose.Types.ObjectId(),amount:bson.Long.fromString('123456789012345678'),decimal:bson.Decimal128.fromString('35.00'),integer:new bson.Int32(4)}];
 let current=[{_id:new mongoose.Types.ObjectId(),stale:true}];
 const db=rows=>({collection(){return {find(_filter,options){assert.equal(options.session,session);return rows().map(d=>bson.serialize(d))}}}});
 const source=db(()=>documents),live={collection(){return {...db(()=>current).collection(),async deleteMany(_filter,options){assert.equal(options.session,session);current=[]},async insertMany(rows,options){assert.equal(options.session,session);current.push(...rows)}}}};
 const expected=await digestCollection(source,'clients',session);
 await replaceRestoreCollection(live,source,'clients',session,expected);
 assert.equal(current.length,1);assert.equal(current[0].amount.toString(),documents[0].amount.toString());assert.equal(current[0].decimal.toString(),'35.00');
 await assert.rejects(replaceRestoreCollection(live,source,'clients',session,{...expected,checksum:'bad'}),/verification failed/);
});
test('restore requires explicit authorization and current admin password before database inspection',async t=>{
 await assert.rejects(executeSystemRestore('admin',{}),/Explicit restore approval/);
 t.mock.method(User,'findById',()=>({select:async()=>({isActive:true,role:'ADMIN',comparePassword:async()=>false})}));
 await assert.rejects(executeSystemRestore('admin',{confirm:true,singleBackendConfirmed:true,confirmation:RESTORE_PHRASE,sourceId:'a',safetyId:'b',password:'wrong'}),/password verification failed/);
 assert.equal(maintenanceActive(),false);
});
