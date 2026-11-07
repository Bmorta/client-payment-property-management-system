import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCommissions,commissionMutation} from '../src/utils/commissionLedger.js';
import {allocatePayments} from '../src/utils/paymentLedger.js';
import {buildSchedule} from '../src/utils/accounting.js';
import {previewCommission} from '../../shared/commissionMath.js';
import {saveCommissionAgreement} from '../src/controllers/commissionController.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import Agent from '../src/models/Agent.js';
import {decodeMapUpload} from '../src/controllers/projectMapController.js';
const agent='507f1f77bcf86cd799439012',id='507f1f77bcf86cd799439011';
const base=()=>({_id:id,__v:0,assignmentId:'CTR-FIX',contract:{totalCents:3600000,downPaymentCents:0,months:6,schedule:buildSchedule(3600000,6,'2026-01-05',0,'2026-01-01')},payments:[],commissionAgreement:{agents:[{agent,agentId:'AGT-1',percentageBps:1000}],percentageBps:1000,termMonths:6,version:1}});
const pay=(amountCents,paymentId='PAY-1',paymentDate='2026-01-05')=>({amountCents,paymentId,paymentDate,type:'INSTALLMENT',createdAt:'2026-01-05T00:00:00Z'});
const calculate=a=>calculateCommissions(a,allocatePayments(a,'2026-12-31'));
test('0.5, 1.2, 1.5 and three months earn only fixed completed commissions',()=>{
 for(const [amount,expected] of [[300000,0],[720000,60000],[900000,60000],[1200000,120000],[1800000,180000]]){const a=base();a.payments=[pay(amount)];const rows=calculate(a).records;assert.equal(rows.reduce((n,r)=>n+r.earnedCents,0),expected);assert.ok(rows.every(r=>r.earnedCents===0||r.earnedCents===r.budgetCents));assert.ok(rows.every(r=>r.releasedCents===0))}
});
test('partial payments accumulate, earning dates reflect completion, and replay adds no duplicates',()=>{
 const a=base();a.payments=[pay(900000),pay(300000,'PAY-2','2026-02-05')];let result=calculate(a);assert.equal(result.records.reduce((n,r)=>n+r.earnedCents,0),120000);assert.equal(result.records[1].firstEarnedAt,'2026-02-05');a.commissionSnapshot=result;assert.equal(commissionMutation(a,allocatePayments(a,'2026-12-31'),{},'replay').events.length,0);
 a.payments=[pay(300000),pay(300000,'PAY-2','2026-02-05')];assert.equal(calculate(a).records[0].earnedCents,60000);
});
test('reversing completion retains actual payout and produces an audited recovery balance',()=>{
 const a=base();a.payments=[pay(600000)];a.commissionSnapshot=calculate(a);const record=a.commissionSnapshot.records[0];a.commissionPayouts=[{payoutId:'CPY-1',commissionId:record.commissionId,amountCents:60000,releaseDate:'2026-01-06'}];a.payments[0].revisions=[{values:{voided:true}}];const update=commissionMutation(a,allocatePayments(a,'2026-12-31'),{username:'admin'},'Void mistaken payment');assert.equal(update.snapshot.records[0].recoveryDueCents,60000);assert.equal(a.commissionPayouts[0].amountCents,60000);assert.ok(update.events.some(e=>e.action==='COMMISSION_EARNINGS_ADJUSTED'));
});
test('variable installments use their actual amounts and mismatched terms retain mapped portions',()=>{
 const a=base();a.contract.totalCents=1200000;a.contract.months=2;a.contract.schedule=[{installment:1,dueDate:'2026-01-05',amountCents:300000},{installment:2,dueDate:'2026-02-05',amountCents:900000}];a.commissionAgreement.termMonths=2;a.payments=[pay(300000)];assert.equal(calculate(a).records[0].earnedCents,60000);assert.equal(calculate(a).records[1].earnedCents,0);
 const b=base();b.commissionAgreement.termMonths=3;b.payments=[pay(900000)];assert.equal(calculate(b).records.reduce((n,r)=>n+r.earnedCents,0),0);b.payments.push(pay(300000,'PAY-2'));assert.equal(calculate(b).records[0].earnedCents,120000);
});
test('preview matches ledger budgets for multiple agents and final rounding',()=>{
 const a=base();a.contract.totalCents=100000000;a.contract.downPaymentCents=2000000;a.commissionAgreement.termMonths=30;a.commissionAgreement.agents=[{agent,percentageBps:600},{agent:id,percentageBps:400}];const preview=previewCommission(a.contract,a.commissionAgreement.agents,30),records=calculate(a).records;
 for(const p of preview){assert.equal(records.filter(r=>r.agent===p.agent).reduce((n,r)=>n+r.budgetCents,0),p.totalCents);assert.equal(p.periods.reduce((n,v)=>n+v,0),p.remainingCents)}
 const sample=previewCommission(a.contract,[{agent,percentageBps:1000}],30)[0];assert.equal(sample.monthlyCents,326667);assert.equal(sample.finalCents,326657);
});
test('existing commission agreements require explicit modify intent',async t=>{
 const a=base();t.mock.method(PropertyAssignment,'findById',()=>({lean:async()=>a}));t.mock.method(Agent,'find',()=>({lean:async()=>[{_id:agent,agentId:'AGT-1',status:'ACTIVE'}]}));let status,body;await saveCommissionAgreement({params:{id},user:{_id:agent},body:{percentage:'10',termMonths:6,agents:[{agent,percentage:'10'}],reason:'Attempt duplicate assignment',expectedVersion:0,confirm:true}},{status(n){status=n;return this},json(v){body=v}},e=>{throw e});assert.equal(status,409);assert.equal(body.code,'PROPERTY_ALREADY_ASSIGNED');
});
test('map validation accepts image bytes unchanged and rejects SVG, invalid versions and giant dimensions',()=>{
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhXkAAAAASUVORK5CYII=','base64');const result=decodeMapUpload({dataBase64:image.toString('base64'),filename:'map.png',expectedVersion:0});assert.equal(result.contentType,'image/png');assert.ok(result.data.equals(image));assert.equal(result.width,1);
 assert.throws(()=>decodeMapUpload({dataBase64:Buffer.from('<svg/>').toString('base64'),expectedVersion:0}));assert.throws(()=>decodeMapUpload({dataBase64:image.toString('base64'),expectedVersion:-1}));const giant=Buffer.from(image);giant.writeUInt32BE(30000,16);assert.throws(()=>decodeMapUpload({dataBase64:giant.toString('base64'),expectedVersion:0}));
});
