import test from 'node:test';
import assert from 'node:assert/strict';
import {contractDates} from '../../shared/contractDates.js';
import {buildSchedule} from '../../shared/paymentSchedule.js';
import {cashOfficeView} from '../src/services/cashOfficeView.js';
import {commissionPipeline} from '../src/controllers/commissionController.js';
import {accountStatusTags} from '../../shared/clientAccountStatuses.js';
test('expected end uses final effective installment, custom term, no overdue extension or early-payment shortening',()=>{
 const schedule=buildSchedule(600000,60,'2026-01-05'),a={contract:{schedule,months:60},summary:{schedule:schedule.map(s=>({...s,balanceCents:0})),fullyPaidMonths:60}};
 assert.equal(contractDates(a,'2026-01-01').end,'2030-12-05');assert.equal(contractDates(a,'2031-01-01').past,true);assert.equal(contractDates(a,'2026-01-01').unpaid,0);
 const revised=buildSchedule(600000,7,'2027-01-31');a.summary.schedule=revised;assert.equal(contractDates(a,'2026-01-01').end,'2027-07-31');assert.equal(contractDates(a,'2027-07-01').days,30);
 assert.equal(contractDates({contract:{schedule:[]}},'2026-01-01').end,null);
});
test('multi-status predicates are OR, client scope uses unique IDs and remains combined with project/agent',()=>{
 const agent='507f1f77bcf86cd799439011',client='507f191e810c19729de860ea';const p=commissionPipeline({agent,clients:client,status:'UNRELEASED,ON_HOLD'}),m=p.find(s=>s.$match?.agent).$match;
 assert.equal(m.agent,agent);assert.equal(String(m.client.$in[0]),client);assert.equal(m.$or.length,2);assert.throws(()=>commissionPipeline({status:'INVALID'}),/Invalid commission/);
});
test('settlement and active are overlapping; history does not hide per-contract lifecycle',()=>{
 const tags=accountStatusTags({lifecycle:'ACTIVE',reactivationIn:{id:'x'}},{settlement:{status:'SETTLED'},balanceCents:0});assert.ok(tags.includes('ACTIVE'));assert.ok(tags.includes('SETTLED'));assert.ok(tags.includes('FULLY_PAID'));assert.ok(tags.includes('REACTIVATED'));
});
test('cash view preserves complete running balance across filters, noncash excluded, carry-forward and linked payout deducted once',()=>{
 const data={collections:[{paymentId:'PAY-1',posted:true,paymentDate:'2026-01-01',amountCents:5000000,method:'CASH',client:{firstName:'Ana'}},{paymentId:'PAY-NONCASH',posted:true,paymentDate:'2026-01-01',amountCents:9900000,method:'GCASH'}],expenses:[{expenseId:'EXP-1',expenseDate:'2026-01-02',amountCents:1000000,method:'CASH',commissionPayoutId:'CPY-1'}],payouts:[{payoutId:'CPY-1',date:'2026-01-02',amountCents:1000000,method:'CASH'}],recoveries:[],entries:[{entryId:'OPEN',kind:'OPENING',status:'POSTED',effectiveDate:'2026-01-01',amountCents:0},{entryId:'TURN',kind:'OWNER_TURNOVER',status:'POSTED',effectiveDate:'2026-01-02',amountCents:2000000}]};
 const v=cashOfficeView(data,'2026-01-01','2026-01-02');assert.equal(v.summary.closingCents,2000000);assert.equal(v.rows.length,3);assert.equal(v.rows.at(-1).runningCents,2000000);
 const filtered=cashOfficeView(data,'2026-01-01','2026-01-02',{kind:'OWNER_TURNOVER'});assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0].runningCents,2000000);assert.equal(filtered.summary.closingCents,2000000);
 assert.equal(cashOfficeView(data,'2026-01-03','2026-01-03').summary.openingCents,2000000);
 assert.equal(cashOfficeView({...data,entries:[]},'2026-01-01','2026-01-02').cash.available,false);
});
