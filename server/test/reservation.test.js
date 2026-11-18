import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,conversionAmounts,reservationDisplay} from '../src/services/reservationService.js';
import {buildSchedule,summarizeAccount} from '../src/utils/accounting.js';
import {cashPosition,financialRows} from '../src/utils/financialReporting.js';

const day='2026-11-18';
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
