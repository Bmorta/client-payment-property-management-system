import test from 'node:test';
import assert from 'node:assert/strict';
import {schedulePrintRecord} from '../src/controllers/schedulePrintController.js';
import {buildSchedule} from '../src/utils/accounting.js';
import {contractAmounts} from '../../shared/contractPrice.js';
const base=()=>({_id:'test',assignmentId:'CTR',contract:{totalCents:1800000,downPaymentCents:0,months:3,contractDate:'2026-01-01',firstDueDate:'2026-02-05',schedule:buildSchedule(1800000,3,'2026-02-05',0,'2026-01-01')},payments:[]});
test('schedule payment methods reflect actual corrected allocations without duplicating principal',()=>{
 const a=base();a.payments=[{paymentId:'p1',amountCents:300000,paymentDate:'2026-01-02',type:'INSTALLMENT',method:'CASH'},{paymentId:'p2',amountCents:900000,paymentDate:'2026-01-03',type:'INSTALLMENT',method:'GCASH'},{paymentId:'void',amountCents:600000,paymentDate:'2026-01-04',type:'INSTALLMENT',method:'CHECK',revisions:[{values:{voided:true}}]}];const before=JSON.stringify(a),data=schedulePrintRecord(a);assert.equal(data.schedule.length,3);assert.deepEqual(data.schedule[0].paymentMethods,['Cash','GCash']);assert.equal(data.schedule[0].paidCents,600000);assert.deepEqual(data.schedule[1].paymentMethods,['GCash']);assert.deepEqual(data.schedule[2].paymentMethods,[]);assert.equal(data.summary.paidCents,1200000);assert.equal(JSON.stringify(a),before);
 a.payments[0].revisions=[{values:{method:'MAYA'}}];assert.deepEqual(schedulePrintRecord(a).schedule[0].paymentMethods,['Maya','GCash']);
});
test('contract TCP definitions validate centavos and do not depend on collected down payment',()=>{
 assert.deepEqual(contractAmounts({totalCents:100000000,downPaymentCents:10000000}),{originalTcpCents:100000000,agreedDownPaymentCents:10000000,tcpAfterDownPaymentCents:90000000});
 assert.equal(contractAmounts({totalCents:100000}).tcpAfterDownPaymentCents,100000);for(const contract of [{totalCents:1.5},{totalCents:100,downPaymentCents:101},{totalCents:100,downPaymentCents:-1}])assert.throws(()=>contractAmounts(contract));
});
