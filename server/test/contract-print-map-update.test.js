import test from 'node:test';
import assert from 'node:assert/strict';
import {computedMonthly,validateMonthlyArrangement,configureSchedule} from '../../shared/contractTerms.js';
import {suggestedCommissionTerm} from '../../shared/commissionMath.js';
import {hasCommissionHistory,deletableCommission} from '../../shared/commissionSafety.js';
import {buildSchedule} from '../src/utils/accounting.js';
import {schedulePrintRecord} from '../src/controllers/schedulePrintController.js';
test('computed installment uses remaining principal and centavo-safe final balancing',()=>{
 assert.equal(computedMonthly(90000000,18000000,36),2000000);assert.equal(computedMonthly(100,0,3),34);assert.equal(computedMonthly(0,0,36),null);assert.throws(()=>validateMonthlyArrangement(72000000,0,36,'20100',false),/Confirm/);assert.doesNotThrow(()=>validateMonthlyArrangement(72000000,0,36,'20100',true));const rows=configureSchedule(buildSchedule(72000000,36,'2026-01-05',0,'2026-01-01'),{dueDay:5},'20100');assert.equal(rows.at(-1).amountCents,1650000);assert.equal(rows.reduce((n,r)=>n+r.amountCents,0),72000000);assert.throws(()=>configureSchedule(rows,{dueDay:5},'21000'),/Monthly amount/);
});
test('commission suggestions cover boundaries and unused records never erase financial dependencies',()=>{
 for(const [months,term] of [[6,6],[12,12],[13,24],[24,24],[36,24],[47,24],[48,30],[60,30]])assert.equal(suggestedCommissionTerm(months),term);
 const r={commissionId:'C1',budgetCents:0,earnedCents:0,sourceAllocations:[]};assert.equal(deletableCommission({},r),true);assert.equal(deletableCommission({commissionPayouts:[{commissionId:'C1',amountCents:0}]},r),false);assert.equal(hasCommissionHistory({commissionEvents:[{commissionId:'C1',previousValues:{earnedCents:1}}]},r),true);assert.equal(deletableCommission({}, {...r,budgetCents:100}),false);
});
test('schedule print uses authoritative advance and partial allocations with latest effective dates',()=>{
 const a={_id:'a',assignmentId:'CTR-1',client:{clientId:'CL-1',firstName:'Ana',lastName:'Buyer'},project:{projectName:'Project'},property:{lotNumber:1},contract:{totalCents:3600000,downPaymentCents:0,months:6,schedule:buildSchedule(3600000,6,'2090-01-05',0,'2026-01-01')},payments:[{paymentId:'PAY-1',type:'INSTALLMENT',amountCents:1500000,paymentDate:'2026-01-05'}]};
 const report=schedulePrintRecord(a);assert.equal(report.schedule[0].status,'PAID_IN_ADVANCE');assert.equal(report.schedule[1].status,'PAID_IN_ADVANCE');assert.equal(report.schedule[2].paidCents,300000);assert.equal(report.schedule[2].balanceCents,300000);assert.equal(report.schedule[2].lastPaidDate,'2026-01-05');assert.equal(report.summary.paidCents,1500000);assert.equal(report.summary.balanceCents,2100000);
});

test('receipt searches preserve leading zeros and combine with transaction filters',async()=>{
 const {filterPayments}=await import('../src/utils/financialReporting.js');const rows=[{paymentId:'P1',receiptNumber:'0000123',method:'CASH',status:'VALID',paymentDate:'2026-11-07',project:{_id:'project'},client:{_id:'client',firstName:'Ana'}},{paymentId:'P2',receiptNumber:'Ab-00123',method:'GCASH',status:'VALID',paymentDate:'2026-11-07',project:{_id:'project'},client:{_id:'client',firstName:'Ana'}},{paymentId:'P3',receiptNumber:null,method:'CASH',paymentDate:'2026-11-07'}];
 assert.deepEqual(filterPayments(rows,{receipt:'0000'}).map(r=>r.paymentId),['P1']);assert.deepEqual(filterPayments(rows,{receipt:' ab-001 ',methods:'CASH,GCASH',from:'2026-11-01',to:'2026-11-30',client:'client',project:'project',status:'VALID',q:'ana'}).map(r=>r.paymentId),['P2']);assert.equal(rows[0].receiptNumber,'0000123');assert.equal(filterPayments(rows,{receipt:'missing'}).length,0);
});
