import {validateTerms} from "../../shared/contractTerms.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import ReceiptClaim from '../src/models/ReceiptClaim.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import Project from '../src/models/Project.js';
import SequenceCounter from '../src/models/SequenceCounter.js';
import ActivityLog from '../src/models/ActivityLog.js';
import {validateReceipt,checkReceipt} from '../src/services/receiptService.js';
import {summarizeExpenses} from '../src/controllers/expenseReportController.js';
import {createProject,updateProject} from '../src/controllers/projectController.js';
import {paymentConfiguration} from '../src/controllers/financeController.js';
import {allocatePayments} from '../src/utils/paymentLedger.js';
import {buildSchedule} from '../src/utils/accounting.js';
const res=()=>({status(n){this.code=n;return this},json(v){this.body=v;return this}}),next=e=>{throw e};
test('manual receipts preserve exact characters, reject missing/malformed values and do not generate IDs',()=>{for(const value of ['0004587','OR-0007/A','ABC_00.12'])assert.equal(validateReceipt(value),value);for(const value of ['',null,123,' 0007','0007 ','<script>','/'])assert.throws(()=>validateReceipt(value))});
test('unique receipt claims allow idempotent retry and reject another transaction',async t=>{
 t.mock.method(PropertyAssignment,'find',()=>({select:()=>({lean:async()=>[]})}));const claims=new Map();
 t.mock.method(ReceiptClaim,'findOneAndUpdate',(filter,update)=>({lean:async()=>{if(!claims.has(filter._id))claims.set(filter._id,update.$setOnInsert);return claims.get(filter._id)}}));
 t.mock.method(ReceiptClaim,'findById',key=>({lean:async()=>claims.get(key)||null}));
 await checkReceipt('0007','SERIES-A','a','PAY-1','request-1',true);await checkReceipt('0007','SERIES-A','a','PAY-2','request-1',true);
 await assert.rejects(checkReceipt('0007','SERIES-A','b','PAY-3','request-2',true),/already reserved/);
 await checkReceipt('0007','SERIES-B','b','PAY-3','request-2',true);assert.equal(claims.size,2);
});
test('historical receipts cannot be reused after a correction or void',async t=>{
 t.mock.method(PropertyAssignment,'find',()=>({select:()=>({lean:async()=>[{_id:'a',payments:[{paymentId:'PAY-1',receiptScope:'SERIES',receiptNumber:'0007',revisions:[{values:{receiptNumber:'0008',voided:true}}]}]}]})}));
 await assert.rejects(checkReceipt('0008','SERIES','b','PAY-2','new-request'),/already used/);
});
test('project creation generates ID and update refuses changes to existing identifiers',async t=>{
 t.mock.method(Project,'aggregate',async()=>[{value:75}]);t.mock.method(SequenceCounter,'findOneAndUpdate',async(_f,u)=>({value:u.$inc?76:75}));t.mock.method(ActivityLog,'create',async()=>({}));
 t.mock.method(Project,'create',async data=>({...data,_id:'p'}));const response=res();await createProject({body:{projectName:'Project',projectCode:'CODE',projectId:'MANUAL'},user:{_id:'u'}},response,next);assert.equal(response.body.data.projectId,'PRJ-000076');
 const existing={projectId:'PRJ-OLD',save(){throw Error('Must not save changed ID')}};t.mock.method(Project,'findById',async()=>existing);const rejected=res();await updateProject({params:{id:'p'},body:{projectId:'CHANGED'}},rejected,next);assert.equal(rejected.code,400);assert.equal(existing.projectId,'PRJ-OLD');
});
test('expense summary totals agree across category, project and month views',()=>{const rows=[{amountCents:10001,expenseDate:'2026-01-05',category:'OFFICE'},{amountCents:20002,expenseDate:'2026-02-05',category:'PROJECT',project:{projectName:'Project A'}}];const s=summarizeExpenses(rows,'2026-01-01','2026-02-28');assert.equal(s.totalCents,30003);assert.equal(s.count,2);for(const k of ['categories','projects','months'])assert.equal(Object.values(s[k]).reduce((n,v)=>n+v,0),30003)});
test('transaction allocation override is validated, audited in payment data, and leaves contract policy intact',()=>{
 assert.throws(()=>paymentConfiguration({allocationPriority:'PENALTY_FIRST',reason:'x'},{role:'STAFF'}));assert.throws(()=>paymentConfiguration({penaltyBasis:'FULL_INSTALLMENT'},{role:'STAFF'}));
 const configuration=paymentConfiguration({allocationPriority:'PENALTY_FIRST',reason:'Buyer requested allocation'},{role:'STAFF'});assert.equal(configuration.allocationPriority,'PENALTY_FIRST');
 const terms={dueDay:5,graceDays:5,penaltyStatus:'ACTIVE',penaltyBasis:'FULL_INSTALLMENT',penaltyRateBps:300,allocationPriority:'PRINCIPAL_FIRST',effectiveDate:'2026-01-01',forfeitureMonths:3,criticalMonths:2,reminderDays:5};
 const a={contract:{totalCents:1200000,downPaymentCents:0,schedule:buildSchedule(1200000,2,'2026-01-05'),monitoringTerms:terms},payments:[{paymentId:'PAY-1',amountCents:10000,paymentDate:'2026-01-11',type:'AUTO',configuration}]};
 const result=allocatePayments(a,'2026-01-11');assert.equal(result.allocations['PAY-1'][0].allocationType,'PENALTY');assert.equal(a.contract.monitoringTerms.allocationPriority,'PRINCIPAL_FIRST');
});

test('pending policies never invent an active penalty basis or non-monthly frequency',()=>{
 const input={dueDay:5,graceDays:5,penaltyPercentage:3,forfeitureMonths:3,criticalMonths:2,reminderDays:5,effectiveDate:'2026-01-01',pendingPaymentPolicy:true,penaltyStatus:'DISABLED',penaltyBasis:null,allocationPriority:null,frequency:'MONTHLY'};
 const result=validateTerms(input,'2026-01-01');assert.equal(result.penaltyBasis,null);assert.equal(result.penaltyStatus,'DISABLED');assert.throws(()=>validateTerms({...input,penaltyStatus:'ACTIVE'},'2026-01-01'));assert.throws(()=>validateTerms({...input,frequency:'DAILY'},'2026-01-01'));
});

test('a simultaneous posting retry may see its own saved receipt without admitting a different correction target',async t=>{
 t.mock.method(PropertyAssignment,'find',()=>({select:()=>({lean:async()=>[{_id:'a',payments:[{paymentId:'PAY-SAVED',requestId:'same-request',receiptScope:'SERIES',receiptNumber:'0007'}]}]})}));
 t.mock.method(ReceiptClaim,'findOneAndUpdate',()=>({lean:async()=>({accountId:'a',paymentId:'PAY-SAVED',requestId:'same-request'})}));
 await checkReceipt('0007','SERIES','a','PAY-NEW','same-request',true,true);
 await assert.rejects(checkReceipt('0007','SERIES','a','PAY-OTHER','same-request',true),/already used/);
});
