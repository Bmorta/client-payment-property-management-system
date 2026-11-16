import test from 'node:test';
import assert from 'node:assert/strict';
import {recordStatusBadges,clientSearchDetail,agentSelectionReason,propertySearchLabel,contractSearchStatus} from '../../shared/searchRecordStatus.js';
import {requestContact} from '../../shared/siteRequestContact.js';
import {searchClients} from '../src/controllers/clientSearchController.js';
import Client from '../src/models/Client.js';
test('client overall status stays separate from every related contract status',()=>{
 const c={clientId:'CL-1',status:'ACTIVE',accounts:[{assignmentId:'CT-1',project:'p',property:'l',lifecycle:'FORFEITED'},{assignmentId:'CT-2',lifecycle:'ACTIVE',pendingCancellation:{}}],projects:[{_id:'p',projectName:'Project A'}],lots:[{_id:'l',propertyId:'LOT-1',phaseNumber:1,blockNumber:2,lotNumber:3,status:'UNAVAILABLE'}]};
 const badges=recordStatusBadges(c);assert.deepEqual(badges,[{status:'ACTIVE',label:'Active'}]);assert.deepEqual(contractSearchStatus(c.accounts[0]),['FORFEITED']);assert.ok(contractSearchStatus(c.accounts[1]).includes('CANCELLATION_REVIEW'));
 assert.match(clientSearchDetail(c),/CT-1.*Forfeited.*Project A.*LOT-1.*Unavailable/);assert.match(clientSearchDetail(c),/CT-2.*Active/);
 assert.deepEqual(contractSearchStatus({lifecycle:'ACTIVE',summary:{category:'HISTORICAL_CANCELLED'}}),['HISTORICAL_CANCELLED']);assert.equal(recordStatusBadges({agentId:'AG-1',status:'INACTIVE'})[0].label,'Agent: Inactive');
});
test('search labels use actual values and assignment restrictions remain explicit',()=>{
 assert.match(propertySearchLabel({propertyId:'LOT-2',status:'FOR_ASSUME',phaseNumber:1,blockNumber:2,lotNumber:4}),/LOT-2.*Phase 1.*Block 2.*Lot 4.*For Assume/);
 assert.match(agentSelectionReason({status:'INACTIVE'}),/active agents/);assert.match(agentSelectionReason({status:'ACTIVE',assignedProjects:['other']},'current'),/not assigned/);assert.equal(agentSelectionReason({status:'ACTIVE',assignedProjects:[]},'current'),'');assert.equal(recordStatusBadges({}) .length,0);
});
test('request contact fallback preserves entered values and does not mutate the client',()=>{
 const client={firstName:'Test',lastName:'Buyer',contactNumber:'',email:'buyer@example.test'};const r=requestContact(client,{phone:'09123456789'});assert.deepEqual(r.errors,{});assert.equal(r.contact.email,client.email);assert.equal(client.contactNumber,'');assert.ok(requestContact(client).errors.phone);assert.ok(requestContact(null,{name:'Prospect',phone:'1',email:'not email'}).errors.email);
});
test('client search projects contact and linked statuses in its existing bounded query',async t=>{
 let pipeline;t.mock.method(Client,'aggregate',async p=>{pipeline=p;return [{rows:[],total:[]}]});let response;await searchClients({query:{q:'Buyer',page:'1'}},{json:r=>{response=r}},e=>{throw e});
 const accountProjection=pipeline.find(p=>p.$lookup?.as==='accounts').$lookup.pipeline[0].$project;assert.equal(accountProjection.lifecycle,1);assert.equal(accountProjection.assignmentId,1);
 const rows=pipeline.at(-1).$facet.rows,projection=rows.at(-1).$project;assert.equal(projection.contactNumber,1);assert.equal(projection.email,1);assert.equal(projection.accounts,1);assert.equal(rows.find(r=>r.$limit).$limit,20);assert.deepEqual(response.data,[]);
});
test('status enrichment reads only matching page accounts in one batch and exposes no ledgers',async t=>{
 const {default:Account}=await import('../src/models/PropertyAssignment.js');const id='507f1f77bcf86cd799439011';
 t.mock.method(Client,'aggregate',async()=>[{rows:[{clientId:'CL-1',accounts:[{_id:id,lifecycle:'ACTIVE'}]}],total:[{count:1}]}]);
 let filter,select;const find=t.mock.method(Account,'find',f=>{filter=f;return {select:s=>{select=s;return {lean:async()=>[{_id:id,lifecycle:'ACTIVE'}]}}}});
 let response;await searchClients({query:{}},{json:r=>{response=r}},e=>{throw e});assert.deepEqual(filter,{_id:{$in:[id]}});assert.equal(find.mock.callCount(),1);assert.match(select,/-notifications/);assert.ok(response.data[0].accounts[0].tags.includes('STATUS_REVIEW_REQUIRED'));assert.equal(response.data[0].accounts[0].payments,undefined);
});
test('fully paid contract search status follows the existing ledger and disappears after reversal',async t=>{
 const {default:Account}=await import('../src/models/PropertyAssignment.js');const {buildSchedule}=await import('../src/utils/accounting.js');const id='507f1f77bcf86cd799439012';
 const account={_id:id,lifecycle:'ACTIVE',assignmentId:'CT-PAID',contract:{totalCents:120000,downPaymentCents:20000,months:2,contractDate:'2025-01-01',firstDueDate:'2025-02-01',schedule:buildSchedule(120000,2,'2025-02-01',20000,'2025-01-01')},payments:[{paymentId:'PAY-1',receiptNumber:'OR-1',amountCents:120000,paymentDate:'2025-01-15',type:'AUTO',method:'CASH'}]};
 t.mock.method(Client,'aggregate',async()=>[{rows:[{clientId:'CL-1',status:'ACTIVE',accounts:[{_id:id,lifecycle:'ACTIVE'}]}],total:[{count:1}]}]);t.mock.method(Account,'find',()=>({select(){return this},lean:async()=>[account]}));let response;
 const run=()=>searchClients({query:{}},{json:r=>{response=r}},e=>{throw e});await run();assert.ok(response.data[0].accounts[0].tags.includes('FULLY_PAID'));assert.equal(response.data[0].status,'ACTIVE');assert.equal(response.data[0].accounts[0].payments,undefined);
 account.payments[0].revisions=[{values:{voided:true}}];await run();assert.ok(!response.data[0].accounts[0].tags.includes('FULLY_PAID'));assert.ok(response.data[0].accounts[0].tags.includes('OUTSTANDING'));
});
