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
