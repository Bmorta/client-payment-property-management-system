import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,conversionAmounts,conversionCreditPlan,eligiblePrecontractPayments,previewConversion,reservationDisplay} from '../src/services/reservationService.js';
import {reservationCollections,mergeReservationCollections} from '../src/services/financialReportService.js';
import {prepareNewContract} from '../src/utils/newContract.js';
import {buildSchedule,summarizeAccount} from '../src/utils/accounting.js';
import {cashPosition,financialRows} from '../src/utils/financialReporting.js';

const day='2026-11-18';
test('conversion preview loads verified receipt evidence, rejects stale pricing and leaves records unchanged',async t=>{
 const {default:Reservation}=await import('../src/models/Reservation.js'),{default:Property}=await import('../src/models/Property.js'),{default:Project}=await import('../src/models/Project.js'),{default:Client}=await import('../src/models/Client.js'),{default:PropertyAssignment}=await import('../src/models/PropertyAssignment.js');
 const {today}=await import('../src/utils/accounting.js'),id='507f1f77bcf86cd799439011',date=today();
 const hold={_id:id,held:true,status:'ACTIVE',disposition:'OUTSTANDING',expiresOn:date,property:id,project:id,client:id,creditPolicy:'DOWN_PAYMENT',payment:{amountCents:500000,paymentId:'FEE',paymentDate:date},precontractPayments:[{paymentId:'DP',receiptNumber:'45',amountCents:4500000,paymentDate:date}],__v:4};
 const lot={_id:id,areaSqm:100,pricePerSqm:5000,__v:2};
 const query=value=>({session:()=>Promise.resolve(value)});
 t.mock.method(Reservation,'findById',async()=>hold);
 t.mock.method(Property,'findOne',()=>query(lot));t.mock.method(Project,'exists',()=>query({_id:id}));t.mock.method(Client,'exists',()=>query({_id:id}));t.mock.method(PropertyAssignment,'exists',()=>query(null));
 const body={months:60,contractDate:date,firstDueDate:date,downPayment:50000,installment:0,additionalAmount:0,reason:'Approved terms',expectedAreaSqm:100,expectedPricePerSqm:5000};
 const original=JSON.stringify(hold),plan=await previewConversion(id,body);
 assert.equal(plan.additionalCents,0);assert.equal(plan.priorDownPaymentCents,4500000);assert.equal(plan.remainingPrincipalCents,45000000);assert.equal(plan.contract.monthlyInstallmentCents,750000);assert.equal(JSON.stringify(hold),original);
 const second=await previewConversion(id,body);assert.equal(plan.token,second.token);
 lot.pricePerSqm=5100;await assert.rejects(()=>previewConversion(id,body),/price changed/);
});
test('pre-contract down-payment receipt is collected before activation and allocated only once after activation',()=>{
 const activation='2026-11-20',contract=prepareNewContract({areaSqm:100,pricePerSqm:5000},{months:60,downPayment:50000,contractDate:activation,firstDueDate:'2026-12-05'},activation);
 const deposit={paymentId:'DP-1',receiptNumber:'00045',amountCents:4500000,paymentDate:'2026-11-19',method:'CASH'};
 const hold={_id:'HOLD',property:'LOT',client:'CLIENT',project:'PROJECT',payment:{paymentId:'RES-1',amountCents:500000,paymentDate:day,method:'CASH'},precontractPayments:[deposit]};
 const receipts=reservationCollections(hold);
 assert.equal(receipts.reduce((n,p)=>n+p.amountCents,0),5000000);
 assert.equal(eligiblePrecontractPayments(hold).length,1);
 const plan=conversionCreditPlan(contract,0,500000,0,false,deposit.amountCents);
 assert.equal(plan.additionalCents,0);assert.equal(plan.remainingDownPaymentCents,0);assert.equal(plan.remainingPrincipalCents,45000000);
 const account={_id:'SALE',contract,payments:[{...deposit,type:'DOWN_PAYMENT',sourceReservationId:'HOLD',contractAllocationDate:activation,allocationPlan:[{installmentId:'I0',amountCents:deposit.amountCents}]}],reservationCredit:{reservationCreditId:'HOLD',paymentId:'CREDIT-RES-1',paymentDate:activation,amountCents:500000,allocationPlan:[{installmentId:'I0',amountCents:500000}]}};
 assert.equal(summarizeAccount(account,'2026-11-19').paidCents,0);
 const ledger=summarizeAccount(account,activation);assert.equal(ledger.downPaymentPaidCents,5000000);assert.equal(ledger.balanceCents,45000000);assert.equal(ledger.payments.find(p=>p.paymentId==='DP-1').paymentDate,deposit.paymentDate);assert.equal(ledger.allocations['DP-1'][0].effectiveDate,activation);
 const combined=[...financialRows([account],[]).collections,...reservationCollections({...hold,appliedPrecontractPaymentIds:['DP-1']})];
 assert.equal(combined.length,2);assert.equal(combined.reduce((n,p)=>n+p.amountCents,0),5000000);
 assert.equal(mergeReservationCollections(financialRows([account],[]).collections,[hold]).length,2);
 assert.equal(mergeReservationCollections([],[{...hold,appliedPrecontractPaymentIds:['DP-1']}]).length,2);
 const voided=mergeReservationCollections([{paymentId:'DP-1',amountCents:0,posted:false}],[hold]);
 assert.equal(voided.find(p=>p.paymentId==='DP-1').posted,false);
 assert.equal(eligiblePrecontractPayments({...hold,precontractRefunds:[{paymentId:'DP-1'}]}).length,0);
 assert.equal(reservationCollections({...hold,precontractRefunds:[{paymentId:'DP-1'}]}).length,2);
});
test('initial down-payment hold without a reservation fee is classified and applied as a genuine down payment',()=>{
 const contract=prepareNewContract({areaSqm:100,pricePerSqm:5000},{months:60,downPayment:50000,contractDate:day,firstDueDate:'2026-12-05'},day);
 const hold={_id:'HOLD',requestId:'initial-request',paymentPurpose:'DOWN_PAYMENT',disposition:'OUTSTANDING',payment:{paymentId:'DP-INITIAL',amountCents:5000000,paymentDate:day,method:'CASH'}};
 assert.equal(reservationCollections(hold)[0].type,'DOWN_PAYMENT');
 const [original]=eligiblePrecontractPayments(hold);assert.equal(original.requestId,'initial-request');
 const plan=conversionCreditPlan(contract,0,0,0,false,original.amountCents);
 assert.equal(plan.creditCents,0);assert.equal(plan.remainingDownPaymentCents,0);assert.equal(plan.remainingPrincipalCents,45000000);
 assert.deepEqual(reservationCollections({...hold,appliedPrecontractPaymentIds:['DP-INITIAL'],disposition:'APPLIED'}),[]);
});
test('shared contract builder preserves full approved terms and computes dates and monthly principal',()=>{
 const contract=prepareNewContract({areaSqm:100,pricePerSqm:5000},{months:60,downPayment:50000,contractDate:day,firstDueDate:'2026-12-05',monthlyInstallment:7500,monitoringTerms:{dueDay:5,graceDays:5,penaltyPercentage:3,forfeitureMonths:6,criticalMonths:3,reminderDays:3,penaltyStatus:'ACTIVE',penaltyBasis:'UNPAID_BALANCE',allocationPriority:'PRINCIPAL_FIRST',frequency:'MONTHLY'}},day);
 assert.equal(contract.totalCents,50000000);assert.equal(contract.downPaymentCents,5000000);assert.equal(contract.monthlyInstallmentCents,750000);assert.equal(contract.schedule.at(-1).dueDate,'2031-11-05');assert.equal(contract.monitoringTerms.graceDays,5);assert.equal(contract.monitoringTerms.penaltyRateBps,300);
 assert.equal(contract.schedule.reduce((n,r)=>n+r.amountCents,0),contract.totalCents);
 const paid=conversionCreditPlan(contract,0,500000,45000,false);
 assert.equal(paid.remainingDownPaymentCents,0);assert.equal(paid.remainingPrincipalCents,45000000);
 const partial=conversionCreditPlan(contract,0,500000,10000,true);
 assert.equal(partial.remainingDownPaymentCents,3500000);assert.equal(partial.remainingPrincipalCents,48500000);
 assert.equal(conversionCreditPlan(contract,0,500000,0,true).additionalCents,0);
 assert.throws(()=>conversionCreditPlan(contract,0,500000,0,false),/stay unpaid/);
 assert.throws(()=>conversionCreditPlan(contract,0,500000,45001,true),/exceeds/);
});
for(const {name,price,down,term,installment,fee,additional} of [
  {name:'down payment',price:50000000,down:5000000,term:60,installment:0,fee:500000,additional:4500000},
  {name:'first installment',price:36000000,down:0,term:60,installment:1,fee:200000,additional:400000}
]){
  test(`reservation credit satisfies the ${name} while cash counts the fee once`,()=>{
    const schedule=buildSchedule(price,term,day,down,day);
    const plan=conversionAmounts(schedule,installment,fee);
    assert.equal(plan.additionalCents,additional);
    const allocation=amountCents=>[{installmentId:`I${installment}`,amountCents}];
    const account={_id:'contract',contract:{contractDate:day,totalCents:price,downPaymentCents:down,schedule},
      reservationCredit:{reservationCreditId:'hold',paymentId:'CREDIT-old',amountCents:fee,paymentDate:day,allocationPlan:allocation(fee)},
      payments:[{paymentId:'new',paymentDate:day,method:'CASH',amountCents:additional,allocationPlan:allocation(additional)}]};
    const summary=summarizeAccount(account,day);
    assert.equal(summary.schedule.find(r=>r.installment===installment).balanceCents,0);
    assert.equal(summary.paidCents,fee+additional);
    assert.equal(summary.totalCollectedCents,additional);
    const data=financialRows([account],[]);
    assert.deepEqual(data.collections.map(p=>p.paymentId),['new']);
    data.collections.push({paymentId:'old',paymentDate:day,method:'CASH',amountCents:fee,posted:true});
    const entries=[{kind:'OPENING',effectiveDate:day,status:'POSTED',amountCents:0}];
    assert.equal(cashPosition(data,entries,day,day).closingCents,fee+additional);
  });
}
test('a hold remains active through its expiry date and appears expired the next Manila day',()=>{
  const row={held:true,status:'ACTIVE',expiresOn:addDays(day,7),payment:{paymentDate:day,amountCents:500000}};
  assert.equal(reservationDisplay(row,row.expiresOn).status,'ACTIVE');
  const next=reservationDisplay(row,addDays(row.expiresOn,1));
  assert.equal(next.status,'EXPIRED');
  assert.equal(next.remainingDays,-1);
  assert.equal(reservationDisplay({...row,status:'CONVERTED',held:false},addDays(row.expiresOn,1)).status,'CONVERTED');
});

test('holding periods use Manila calendar-date labels and reject invalid dates or durations',async()=>{
  const {reservationExpiry}=await import('../../shared/reservationDates.js');
  assert.equal(reservationExpiry('2026-11-18',7),'2026-11-25');
  assert.equal(reservationExpiry('2026-11-18',15),'2026-12-03');
  assert.equal(reservationExpiry('2026-11-20',30),'2026-12-20');
  assert.equal(reservationExpiry('2026-02-30',7),'');
  for(const invalid of [0,-1,2.5,366,'7'])assert.equal(reservationExpiry(day,invalid),'');
  const row={held:true,status:'ACTIVE',startDate:day,expiresOn:reservationExpiry(day,7),payment:{paymentDate:'2026-11-19',amountCents:500000}};
  assert.equal(reservationDisplay(row,day).startDate,day);
  assert.equal(reservationDisplay(row,day).remainingDays,7);
});
