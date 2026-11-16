import test from 'node:test';
import assert from 'node:assert/strict';
import {refundComputation,refundPlan,refundInstallmentAllocations,penaltyBreakdown} from '../../shared/refundSettlement.js';
import {refundAcknowledgement,refundAcknowledgementDocument} from '../../shared/refundAcknowledgement.js';
const policy={option:'PERCENT',refundPercentage:'30',penaltyDecision:'DEDUCT'};
test('refund percentage uses exact cents and only approved actual deductions',()=>{
 assert.deepEqual(refundComputation(100001,1000,policy),{percentage:30,approvedPercentageBps:3000,percentageIsEquivalent:false,grossCents:30000,penaltyDeductionCents:1000,netCents:29000});
 assert.equal(refundComputation(100000,1000,{...policy,penaltyDecision:'NO_DEDUCTION'}).netCents,30000);
 assert.equal(refundComputation(100000,1000,{...policy,penaltyDecision:'CUSTOM',customPenaltyDeduction:'5.50'}).netCents,29450);
 for(const input of [{...policy,refundPercentage:101},{...policy,penaltyDecision:'CUSTOM',customPenaltyDeduction:11},{...policy,refundPercentage:0},{...policy,penaltyDecision:'SETTLED'}])assert.throws(()=>refundComputation(100000,1000,input));
});
test('installment schedule preserves total, end-of-month anchors and custom final balance',()=>{
 const rows=refundPlan({amountCents:10000,months:3,firstDate:'2027-01-31'});
 assert.deepEqual(rows.map(r=>r.date),['2027-01-31','2027-02-28','2027-03-31']);
 assert.deepEqual(rows.map(r=>r.amountCents),[3333,3333,3334]);
 assert.deepEqual(refundPlan({amountCents:10000,months:3,firstDate:'2028-01-31',customMonthlyCents:3000}).map(r=>r.amountCents),[3000,3000,4000]);
 assert.throws(()=>refundPlan({amountCents:10000,months:3,firstDate:'2027-02-30'}));
 assert.throws(()=>refundPlan({amountCents:10000,months:3,firstDate:'2027-01-01',customMonthlyCents:5000}));
 assert.deepEqual(refundInstallmentAllocations(rows,2000,5000).map(r=>r.amountCents),[1333,3333,334]);
 assert.throws(()=>refundInstallmentAllocations(rows,9000,1001));
});
test('monthly penalty detail deduplicates assessments without dropping separate months',()=>{
 assert.deepEqual(penaltyBreakdown({assessments:[{assessmentId:'a',cycleDate:'2027-01-01',balanceCents:500},{assessmentId:'a',cycleDate:'2027-01-01',balanceCents:500},{assessmentId:'b',cycleDate:'2027-02-01',balanceCents:100}]}),[{month:'2027-01',amountCents:500},{month:'2027-02',amountCents:100}]);
});
const example=()=>({caseId:'CAN-1',status:'APPROVED_PENDING',refundPaidCents:0,snapshot:{asOf:'2027-01-01',client:{name:'Buyer',clientId:'CL-1'},sources:[{assignmentId:'CT-1',principalCents:99999999,grossCents:50000,netCents:40000,approvedPercentageBps:3000,property:{propertyId:'LOT-1'}}],distribution:{totalNetCents:40000,refundCents:40000,creditCents:0,unusedCents:0},refundSchedule:[{installment:1,date:'2027-01-01',amountCents:20000,method:'CASH'},{installment:2,date:'2027-02-01',amountCents:20000,method:'BANK_TRANSFER'}],originalPayments:[{secret:'PAYMENT_HISTORY_SENTINEL'}],acknowledgementTerms:{}}});
const brand={companyName:'Example Realty'};
test('single acknowledgement excludes original payments and gross, and tracks paid versus outstanding',()=>{
 const c=example(),initial=refundAcknowledgement(c,[],brand);assert.equal(initial.finalAmountCents,40000);assert.equal(initial.finalWording,false);
 c.refundPaidCents=25000;const current=refundAcknowledgement(c,[{status:'POSTED',amountCents:25000,date:'2027-01-03',method:'CASH'}],brand);
 assert.equal(initial.acknowledgementId,current.acknowledgementId);assert.equal(current.remainingCents,15000);assert.deepEqual(current.schedule.map(r=>r.paidCents),[20000,5000]);
 const html=refundAcknowledgementDocument(current);assert.equal((html.match(/class="copy"/g)||[]).length,2);assert.match(html,/size:8.5in 13in/);assert.doesNotMatch(html,/PAYMENT_HISTORY_SENTINEL|99999999|₱500.00|total payments|total amount paid/i);
 assert.throws(()=>refundAcknowledgement(c,[],brand),/reconcile/);
});
test('noncash credits are reserved until posting; final and personal declarations are conditional',()=>{
 const c=example();c.snapshot.distribution={totalNetCents:40000,refundCents:0,creditCents:40000,unusedCents:0};c.snapshot.refundSchedule=[];c.snapshot.targets=[{assignmentId:'CT-2',property:{propertyId:'LOT-2'},creditCents:40000}];
 let a=refundAcknowledgement(c,[],brand);assert.equal(a.creditApplied,false);assert.equal(a.finalWording,false);assert.match(refundAcknowledgementDocument(a),/approved but remains reserved/);
 c.finalSnapshot={effectiveDate:'2027-01-02',targets:c.snapshot.targets};a=refundAcknowledgement(c,[],brand);assert.equal(a.fulfilled,true);assert.equal(a.finalWording,false);
 c.snapshot.acknowledgementTerms={legalWordingReviewed:true,legalReviewReference:'Reviewed agreement',clientVoluntaryPersonalReasons:true,clientConfirmationReference:'Signed statement'};a=refundAcknowledgement(c,[],brand);assert.equal(a.finalWording,true);assert.equal(a.personalDeclaration,true);assert.match(refundAcknowledgementDocument(a),/not cash received/);
});
test('backdated releases retain their recorded installment allocation',()=>{
 const c=example();c.refundPaidCents=30000;
 const releases=[{date:'2027-01-01',createdAt:'2027-01-05',method:'CASH',amountCents:10000,installmentAllocations:[{installment:2,amountCents:10000}]},{date:'2027-01-03',createdAt:'2027-01-03',method:'BANK_TRANSFER',amountCents:20000,installmentAllocations:[{installment:1,amountCents:20000}]}];
 const a=refundAcknowledgement(c,releases,brand);assert.equal(a.schedule[0].actual[0].method,'BANK_TRANSFER');assert.equal(a.schedule[1].actual[0].date,'2027-01-01');assert.equal(a.remainingCents,10000);
});
