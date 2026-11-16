import test from 'node:test';
import assert from 'node:assert/strict';
import {requestDeletionPolicy,requestListFilter} from '../../shared/siteRequestRetention.js';
import {requestFlags} from '../../shared/siteRequests.js';
test('contract dependency policy handles forfeiture, legacy lifecycle, missing links and multiple properties',()=>{
 const r={account:'a',client:'c',property:'p',type:{mode:'CLIENT_PROPERTY'}};
 for(const lifecycle of ['ACTIVE','CANCELLATION_PENDING',undefined])assert.equal(requestDeletionPolicy(r,[{_id:'a',client:'c',property:'p',lifecycle}]).allowed,false);
 for(const lifecycle of ['CANCELLED','FORFEITED','TRANSFERRED'])assert.equal(requestDeletionPolicy(r,[{_id:'a',client:'c',property:'p',lifecycle},{_id:'b',client:'c',property:'other',lifecycle:'ACTIVE'}]).allowed,true);
 assert.equal(requestDeletionPolicy(r,[]).allowed,false);
 assert.equal(requestDeletionPolicy(r,[{_id:'a',client:'c',property:'p',lifecycle:'CANCELLED'},{_id:'new',client:'c',property:'p',lifecycle:'ACTIVE'}]).allowed,false);
 assert.equal(requestDeletionPolicy({type:{mode:'AGENT_TRIPPING'}},[]).allowed,true);
});
test('default filters omit terminal requests and history makes them accessible; terminal flags stay off',()=>{
 assert.ok(requestListFilter().status.$nin.includes('DISREGARDED'));
 for(const status of ['DISREGARDED','DELETED','COMPLETED']){assert.equal(requestListFilter({scope:status}).status,status);assert.ok(requestListFilter({history:'1'}).status.$in.includes(status));assert.ok(Object.values(requestFlags({status,schedule:{start:'2020-01-01',end:'2020-01-02'},followUp:{required:true}})).every(x=>!x));}
 assert.equal(requestListFilter({status:'CANCELLED'}).status,'CANCELLED');
});
