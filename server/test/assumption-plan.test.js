import test from 'node:test';
import assert from 'node:assert/strict';
import {makeSchedule} from '../src/services/assumptionService.js';

const source={contract:{totalCents:100_000,months:3,termType:'CUSTOM',contractDate:'2026-01-01',firstDueDate:'2026-02-01',schedule:[{installment:0,dueDate:'2026-01-01',amountCents:10_000},{installment:1,dueDate:'2026-02-01',amountCents:30_000},{installment:2,dueDate:'2026-03-01',amountCents:30_000},{installment:3,dueDate:'2026-04-01',amountCents:30_000}]}};
const snapshot={principalPaidCents:40_000};
const sum=rows=>rows.reduce((total,row)=>total+row.amountCents,0);

test('Option A preserves original dates and applies only the explicitly reviewed credit',()=>{
 const plan=makeSchedule({option:'A',recognizedCreditCents:20_000,effectiveDate:'2026-02-01',reason:'Approved buyer assumption'},source,snapshot);
 assert.deepEqual(plan.schedule.map(row=>row.dueDate),source.contract.schedule.map(row=>row.dueDate));
 assert.equal(sum(plan.schedule),80_000);
 assert.equal(plan.schedule[0].amountCents,0);
 assert.equal(plan.schedule[1].amountCents,20_000);
});

test('Option A with no approved credit leaves the original contract amounts intact',()=>{
 const plan=makeSchedule({option:'A',recognizedCreditCents:0,effectiveDate:'2026-02-01',reason:'Approved buyer assumption'},source,snapshot);
 assert.equal(sum(plan.schedule),source.contract.totalCents);
 assert.deepEqual(plan.schedule.map(row=>row.amountCents),source.contract.schedule.map(row=>row.amountCents));
});

test('assumption plan rejects credit greater than verified principal paid',()=>{
 assert.throws(()=>makeSchedule({option:'A',recognizedCreditCents:40_001,effectiveDate:'2026-02-01',reason:'Approved buyer assumption'},source,snapshot),/no greater than the principal paid/);
});

for(const option of ['B','C'])test(`Option ${option} reconciles revised schedule to explicit credit`,()=>{
 const plan=makeSchedule({option,recognizedCreditCents:15_000,revisedTotalCents:120_000,months:4,firstDueDate:'2026-03-01',effectiveDate:'2026-02-01',reason:'Approved revised buyer terms'},source,snapshot);
 assert.equal(plan.totalCents,120_000);
 assert.equal(sum(plan.schedule),105_000);
 assert.equal(plan.schedule.length,4);
 assert.ok(plan.schedule.every(row=>row.dueDate>='2026-03-01'));
});
