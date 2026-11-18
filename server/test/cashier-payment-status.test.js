import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchedule,summarizeAccount} from '../src/utils/accounting.js';
import {cashierBuyerStatus,cashierContractStatus} from '../src/utils/cashierPaymentStatus.js';

const account=(payment=0)=>({
  lifecycle:'ACTIVE',
  contract:{
    totalCents:1800000,downPaymentCents:0,months:3,contractDate:'2026-10-01',
    firstDueDate:'2026-11-18',schedule:buildSchedule(1800000,3,'2026-11-18',0,'2026-10-01'),
    monitoringTerms:{effectiveDate:'2026-10-01',graceDays:7,reminderDays:3,penaltyStatus:'DISABLED',forfeitureMonths:3}
  },
  payments:payment?[{paymentId:'paid',paymentDate:'2026-10-20',method:'CASH',type:'AUTO',amountCents:payment}]:[]
});
const status=(contract,date)=>cashierContractStatus(contract,summarizeAccount(contract,date),date);

test('cashier status uses the due date before penalty grace ends',()=>{
  const unpaid=account();
  assert.equal(status(unpaid,'2026-11-12').status,'UPDATED');
  assert.equal(status(unpaid,'2026-11-15').status,'DUE_SOON');
  assert.deepEqual(status(unpaid,'2026-11-18'),{status:'DUE_TODAY',nextDueDate:'2026-11-18',installments:1,dueCents:600000});
  const late=status(account(100000),'2026-11-19');
  assert.equal(late.status,'OVERDUE');
  assert.equal(late.dueCents,500000);
});

test('advance allocation, settlement and closed contracts are recognized',()=>{
  assert.equal(status(account(600000),'2026-11-16').status,'ADVANCE_PAID');
  assert.equal(status(account(600000),'2026-11-20').status,'UPDATED');
  assert.equal(status(account(1800000),'2026-11-16').status,'FULLY_PAID');
  assert.equal(cashierContractStatus({...account(),lifecycle:'CANCELLED'},null,'2026-11-19'),null);
  assert.equal(cashierBuyerStatus([]),null);
});

test('buyer summary adds only due amounts across affected contracts',()=>{
  const due=status(account(100000),'2026-11-19');
  const current=status(account(600000),'2026-11-19');
  assert.deepEqual(cashierBuyerStatus([due,current,null]),{
    status:'OVERDUE',contracts:2,affectedContracts:1,installments:1,dueCents:500000,nextDueDate:'2026-11-18'
  });
});
