import test from 'node:test';import assert from 'node:assert/strict';import {matchesIndex,isActiveContractIndex} from '../../shared/databaseIndexes.js';
import fs from 'node:fs/promises';
test('index equivalence uses actual constraints, not names; preserves compound ordering, partial scope, TTL and collation',()=>{
 const key={property:1},options={unique:true,partialFilterExpression:{lifecycle:'ACTIVE'}};
 assert.equal(matchesIndex({name:'office_index',key,unique:true,partialFilterExpression:{lifecycle:{$eq:'ACTIVE'}}},key,options),true);
 assert.equal(isActiveContractIndex({key,unique:true,partialFilterExpression:{lifecycle:'ACTIVE'},collation:{locale:'simple'}}),true);
 assert.equal(isActiveContractIndex({key,unique:true,partialFilterExpression:{lifecycle:'ACTIVE'},collation:{locale:'en',strength:2}}),false);
 assert.equal(matchesIndex({key:{a:1,b:1}},{b:1,a:1}),false);assert.equal(matchesIndex({key,expireAfterSeconds:30},key,{}),false);
 assert.equal(matchesIndex({key,unique:true},key,options),false);assert.equal(isActiveContractIndex({key,unique:true,partialFilterExpression:{lifecycle:'ACTIVE',project:1}}),false);
});
test('ordinary workflows have no backup eligibility guard; startup verifies without migration or automatic indexing',async()=>{
 for(const file of ['lotTransferService','forfeitureService','cancellationService']){const source=await fs.readFile(new URL('../src/services/'+file+'.js',import.meta.url),'utf8');assert.doesNotMatch(source,/assertEligibleBackup|backupRequirement\(/)}
 const source=await fs.readFile(new URL('../src/server.js',import.meta.url),'utf8');assert.match(source,/inspectDatabaseReadiness\(\{record:true,probe:true\}\)/);assert.match(source,/autoIndex:false,autoCreate:false/);assert.doesNotMatch(source,/applyReviewedSchema|applyActiveContractUpgrade/);
});
import {EventEmitter} from 'node:events';
import {maintenanceWriteGate,withMaintenance} from '../src/services/maintenanceGate.js';
test('a completed response on a disconnected socket does not leave maintenance permanently blocked',async()=>{
 const res=new EventEmitter();res.end=()=>res;res.status=()=>res;res.json=()=>res.end();maintenanceWriteGate({method:'POST',path:'/api/finance/payments'},res,()=>{});
 res.emit('close');res.end();let entered=false;await withMaintenance(async()=>{entered=true});assert.equal(entered,true);
});
import {inspectDatabaseReadiness,transactionReadiness} from '../src/services/databaseReadiness.js';
test('disconnected databases and a non-writable replica member never report Ready',async()=>{
 const state=await inspectDatabaseReadiness();assert.equal(state.ready,false);assert.equal(state.connection,'DISCONNECTED');
 const replica={admin:()=>({command:async()=>({setName:'rs0',logicalSessionTimeoutMinutes:30,isWritablePrimary:false})})};assert.equal((await transactionReadiness(replica)).supported,false);
});
