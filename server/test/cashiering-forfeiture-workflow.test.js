import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteUnpaidInstallments} from '../../shared/installmentQuote.js';
import {forfeitureActions,assertForfeitureReviewTransition} from '../../shared/forfeitureWorkflow.js';
import {cashierRow,cashTender} from '../../client/src/utils/cashierDraft.js';
import {buildSchedule} from '../../shared/paymentSchedule.js';
import {allocatePayments} from '../src/utils/paymentLedger.js';
import {preparePaymentIntent,installmentQuote} from '../src/utils/paymentIntent.js';
const terms={dueDay:5,graceDays:5,penaltyPercentage:3,penaltyRateBps:300,forfeitureMonths:3,criticalMonths:2,reminderDays:3,penaltyStatus:'ACTIVE',penaltyBasis:'UNPAID_BALANCE',allocationPriority:'PRINCIPAL_FIRST',frequency:'MONTHLY',effectiveDate:'2026-01-01'};
const account=()=>({assignmentId:'CASHIER',lifecycle:'ACTIVE',penaltyCalculationRule:'CURRENT_OVERDUE',contract:{contractDate:'2026-01-01',totalCents:3600000,downPaymentCents:0,months:6,firstDueDate:'2026-01-05',schedule:buildSchedule(3600000,6,'2026-01-05',0,'2026-01-01'),monitoringTerms:terms},payments:[]});
const row={monthsToPay:'',principalAmount:'',type:'AUTO',selected:{},notesMode:'AUTO'};
const context=a=>{const s=allocatePayments(a,'2026-01-05');return {schedule:s.schedule,assessments:s.assessments}};
test('typing 1, 2, 3, 6 periods and changing 3 to 2 uses the exact dated schedule immediately',()=>{
 const a=account(),c=context(a),before=JSON.stringify(c);
 for(const n of [1,2,3,6,3,2]){const d=cashierRow({...row,monthsToPay:String(n)},c);assert.equal(Number(d.amount),n*6000);assert.equal(d.type,'INSTALLMENT');assert.deepEqual(d.quote,installmentQuote(a,'2026-01-05',n));assert.equal(d.quote.periods.length,n)}
 assert.equal(JSON.stringify(c),before);assert.equal(cashierRow({...row,monthsToPay:'1.5'},c).amount,'');assert.match(cashierRow({...row,monthsToPay:'7'},c).error,/exceed/);
 const twelve=account();twelve.contract.totalCents=7200000;twelve.contract.months=12;twelve.contract.schedule=buildSchedule(7200000,12,'2026-01-05',0,'2026-01-01');assert.equal(Number(cashierRow({...row,monthsToPay:'12'},context(twelve)).amount),72000);
});
test('advance-covered periods are skipped, partial and final amounts are quoted without penalties',()=>{
 const a=account();a.contract.totalCents=3600001;a.contract.schedule=buildSchedule(3600001,6,'2026-01-05',0,'2026-01-01').map((r,i)=>({...r,amountCents:i===5?600001:600000}));a.payments=[{paymentId:'OLD',paymentDate:'2026-01-01',type:'INSTALLMENT',amountCents:1500000}];
 const c=context(a),d=cashierRow({...row,monthsToPay:'2'},c);assert.deepEqual(d.quote.periods.map(p=>p.installment),[3,4]);assert.equal(d.amount,'9000.00');assert.match(d.suggestedRemarks,/March 2026 and April 2026/);
 const all=quoteUnpaidInstallments(c.schedule,4);assert.equal(all.amountCents,2100001);assert.equal(all.periods.at(-1).balanceCents,600001);
 const posted=preparePaymentIntent(a,{paymentDate:'2026-01-05',type:d.type,principalAmount:d.amount,monthsToPay:2});assert.equal(posted.principalCents,900000);assert.equal(posted.fullyCoveredInstallments,2);assert.equal(posted.penaltyCents,0);
});
test('amended/retired periods and adjusted amounts use unpaid authoritative rows; stale month amount is rejected',()=>{
 const schedule=[{installment:1,dueDate:'2026-01-05',balanceCents:500000,retired:true},{installment:7,dueDate:'2026-02-05',balanceCents:450000},{installment:8,dueDate:'2026-03-05',balanceCents:250001}];assert.equal(quoteUnpaidInstallments(schedule,2).amountCents,700001);
 const a=account();assert.throws(()=>preparePaymentIntent(a,{paymentDate:'2026-01-05',type:'INSTALLMENT',principalAmount:18000,monthsToPay:2}),/no longer matches/);
 assert.throws(()=>preparePaymentIntent(a,{paymentDate:'2026-01-05',type:'AUTO',principalAmount:12000,monthsToPay:2}),/no longer matches/);
 const partial=preparePaymentIntent(a,{paymentDate:'2026-01-05',type:'INSTALLMENT',principalAmount:3000});assert.equal(partial.fullyCoveredInstallments,0);assert.equal(partial.partialInstallments[0].balanceCents,300000);
});
test('cashier displays principal and penalty separately; cash change is never a client allocation',()=>{
 const a=account(),ledger=allocatePayments(a,'2026-02-11'),assessment=ledger.assessments[0],c={schedule:ledger.schedule,assessments:ledger.assessments},r={...row,monthsToPay:'1',penaltyDecision:'NOW',selected:{[assessment.assessmentId]:180}};
 const d=cashierRow(r,c),p=preparePaymentIntent(a,{paymentDate:'2026-02-11',type:d.type,principalAmount:d.amount,monthsToPay:1,penaltyDecision:'NOW',penaltySelections:[{assessmentId:assessment.assessmentId,amount:180}]});assert.equal(p.principalCents,600000);assert.equal(p.penaltyCents,18000);assert.equal(p.amountCents,618000);assert.match(d.suggestedRemarks,/Penalty payment/);
 assert.deepEqual(cashTender(618000,'CASH','7000'),{valid:true,tenderedCents:700000,changeCents:82000,remainingCents:0});assert.equal(cashTender(618000,'CASH','5000').valid,false);assert.equal(cashTender(618000,'CASH','').changeCents,0);assert.equal(cashTender(618000,'BANK','7000').changeCents,0);
});
test('forfeiture review transitions require review, preserve explicit approval, and keep release separate',()=>{
 const a=account();assert.deepEqual(forfeitureActions(a),['MARK_REVIEW']);for(const action of ['FORFEIT','REJECT','CANCEL_REVIEW'])assert.throws(()=>assertForfeitureReviewTransition(a,action),/Start a forfeiture review/);
 a.forfeitureReviews=[{status:'UNDER_REVIEW'}];assert.deepEqual(forfeitureActions(a),['FORFEIT','REJECT','CANCEL_REVIEW']);assert.throws(()=>assertForfeitureReviewTransition(a,'MARK_REVIEW'),/already has/);assert.doesNotThrow(()=>assertForfeitureReviewTransition(a,'REJECT'));
 a.forfeitureReviews.push({status:'REJECTED'});assert.deepEqual(forfeitureActions(a),['MARK_REVIEW']);a.lifecycle='FORFEITED';a.property={reopeningStatus:'PENDING'};assert.deepEqual(forfeitureActions(a),['REOPEN','REJECT_REOPEN','RETURN_REOPEN','REACTIVATE']);a.lifecycle='TRANSFERRED';assert.deepEqual(forfeitureActions(a),[]);
});
test('eligibility follows grace, partial balances, advance payments and the configured unpaid threshold',()=>{
 const a=account();assert.notEqual(allocatePayments(a,'2026-03-10').riskStatus,'FORFEITURE_REVIEW_REQUIRED');assert.equal(allocatePayments(a,'2026-03-11').riskStatus,'FORFEITURE_REVIEW_REQUIRED');
 a.payments=[{paymentId:'ADV',paymentDate:'2026-01-01',type:'INSTALLMENT',amountCents:1800000}];assert.equal(allocatePayments(a,'2026-03-11').consecutiveUnpaidMonths,0);
 a.payments[0].amountCents=300000;assert.equal(allocatePayments(a,'2026-03-11').consecutiveUnpaidMonths,3);assert.equal(allocatePayments(a,'2026-03-11').riskStatus,'FORFEITURE_REVIEW_REQUIRED');assert.equal(a.lifecycle,'ACTIVE','no automatic forfeiture');
});
