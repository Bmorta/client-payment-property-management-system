import test from 'node:test';
import assert from 'node:assert/strict';
import {targetKey,validatedTarget,validatedAttribution,splitSalesValue} from '../src/utils/salesPlanningRules.js';
import {buildSalesPerformance,previousYearDate} from '../src/utils/salesPerformance.js';
import {attributedSaleAgents} from '../src/utils/salesClassification.js';

const A='aaaaaaaaaaaaaaaaaaaaaaaa',B='bbbbbbbbbbbbbbbbbbbbbbbb',P='cccccccccccccccccccccccc',ID='dddddddddddddddddddddddd';
const approved=[{agentId:A,role:'PRIMARY',shareBps:7000},{agentId:B,role:'SUPPORT',shareBps:3000}];
const account=(id,date,valueCents,shares=[])=>({_id:id,assignmentId:'CTR-'+id,project:P,lifecycle:'ACTIVE',contract:{contractDate:date,totalCents:valueCents},commissionAgreement:{agents:[{agent:A,percentageBps:500}]},...(shares.length?{salesAttribution:{shares,version:1}}:{})});
test('approved shares require distinct agents, one primary and exactly 100%; cents never double count',()=>{
 assert.deepEqual(validatedAttribution(approved),approved);
 assert.throws(()=>validatedAttribution([{...approved[0],shareBps:9999}]),/100%/);
 assert.throws(()=>validatedAttribution([approved[0],{...approved[1],agentId:A}]),/twice/);
 assert.throws(()=>validatedAttribution([approved[0],{...approved[1],role:'PRIMARY'}]),/one primary/);
 assert.throws(()=>validatedAttribution([{...approved[0],shareBps:7000.5},approved[1]]),/positive share/);
 const parts=splitSalesValue(10001,approved);assert.equal(parts.reduce((n,p)=>n+p.valueCents,0),10001);assert.equal(parts[0].valueCents,7001);assert.equal(parts[1].valueCents,3000);
 assert.deepEqual(attributedSaleAgents(account(ID,'2026-11-01',100,approved),{agent:'legacy'}),[A,B]);
});
test('calendar target identities are unique per scope and period and validate nonnegative safe amounts',()=>{
 assert.equal(targetKey('MONTH','2026-11','COMPANY'),'target:MONTH:2026-11:COMPANY:OFFICE');
 assert.notEqual(targetKey('MONTH','2026-11','AGENT',A),targetKey('MONTH','2026-11','AGENT',B));
 assert.throws(()=>targetKey('MONTH','2026-13','COMPANY'),/valid calendar/);
 assert.throws(()=>validatedTarget({periodType:'YEAR',period:'2026',scope:'COMPANY',valueCents:0,units:0}),/positive/);
 assert.throws(()=>validatedTarget({periodType:'YEAR',period:'2026',scope:'COMPANY',valueCents:1.5,units:1}),/positive/);
 assert.equal(validatedTarget({periodType:'YEAR',period:'2026',scope:'PROJECT',subject:P,valueCents:0,units:10}).value.units,10);
});
test('monthly and annual targets use calendar bookings, agent achievements weighted and unverified excluded',()=>{
 const accounts=[account('1','2026-11-01',50000000,approved),account('2','2026-11-02',40000000),account('3','2026-01-01',10000000,approved),account('4','2025-11-01',40000000,approved),{...account('5','2026-11-03',70000000,approved),transferIn:{sourceId:'1'}},account('6','2026-11-25',10000000,approved)];
 const target=(scope,subject,periodType,period,valueCents,units)=>{const {key,value}=validatedTarget({scope,subject,periodType,period,valueCents,units});return {_id:key,value,version:1}};
 const targets=[target('COMPANY','','MONTH','2026-11',100000000,5),target('AGENT',A,'MONTH','2026-11',50000000,2),target('COMPANY','','YEAR','2026',200000000,10)];
 const d=buildSalesPerformance({accounts,selectedIds:new Set(accounts.map(a=>a._id)),agents:[{_id:A,fullName:'A'},{_id:B,fullName:'B'}],projects:[{_id:P,projectName:'P'}],targets,from:'2026-11-01',to:'2026-11-20',today:'2026-11-20',inventory:{sold:5,available:3,reserved:2,excluded:4}});
 assert.equal(d.comparison.grossCents,90000000);assert.equal(d.comparison.priorGrossCents,40000000);assert.equal(d.comparison.valueChange,1.25);
 assert.equal(d.forecast.projectedCents,135000000);assert.equal(d.sellThrough.rate,0.5);
 assert.equal(d.leaderboard[0].valueCents,35000000);assert.equal(d.leaderboard[0].unitBps,7000);assert.equal(d.leaderboard[1].valueCents,15000000);
 assert.equal(d.unverifiedValueCents,40000000);
 const agent=d.targets.find(r=>r.scope==='AGENT');assert.equal(agent.actualValueCents,35000000);assert.equal(agent.actualUnitBps,7000);assert.equal(agent.valueAchievement,0.7);assert.equal(agent.unitAchievement,0.35);assert.equal(agent.unverifiedBookingCount,1);
 assert.equal(d.targets.find(r=>r.periodType==='YEAR').actualValueCents,100000000);
 assert.equal(d.targets.find(r=>r.scope==='COMPANY'&&r.periodType==='MONTH').actualValueCents,90000000);
});
test('historical cutoff comparison, zero denominator and project/agent filters do not misstate target achievement',()=>{
 const accounts=[account('1','2026-11-02',50000000,approved)],target=validatedTarget({periodType:'YEAR',period:'2027',scope:'COMPANY',valueCents:10000000,units:1});
 const d=buildSalesPerformance({accounts,selectedIds:new Set(['1']),targets:[{_id:target.key,value:target.value,version:1}],from:'2026-11-01',to:'2026-11-20',today:'2026-11-20',planningYear:'2027',agent:A,inventory:{sold:1,available:0,reserved:0,excluded:0}});
 assert.equal(d.comparison.valueChange,null);assert.equal(d.sellThrough,null);assert.equal(d.targets.length,0);assert.equal(d.leaderboard[0].valueCents,35000000);
 assert.equal(previousYearDate('2024-02-29'),'2023-02-28');
 const unscoped=buildSalesPerformance({accounts,selectedIds:new Set(['1']),targets:[{_id:target.key,value:target.value,version:1}],from:'2026-11-01',to:'2026-11-20',today:'2026-11-20',planningYear:'2027'});
 assert.equal(unscoped.targets[0].actualValueCents,0);assert.ok(unscoped.targets[0].cutoff<unscoped.targets[0].start);
});
test('planning writes are revision guarded, auditable and do not touch account/payment documents',async t=>{
 const {saveSalesTarget,saveSalesAttribution}=await import('../src/controllers/salesPlanningController.js');
 const {default:Model}=await import('../src/models/SalesPlanningRecord.js'),{default:Account}=await import('../src/models/PropertyAssignment.js'),{default:Agent}=await import('../src/models/Agent.js');
 const records=new Map();
 t.mock.method(Model,'findById',key=>({lean:async()=>records.get(key)||null}));
 t.mock.method(Model,'create',async row=>{records.set(row._id,row);return row});
 t.mock.method(Model,'findOneAndUpdate',(filter,update)=>({lean:async()=>{const old=records.get(filter._id);if(!old||old.version!==filter.version)return null;const next={...old,value:update.$set.value,version:old.version+1,history:[...old.history,update.$push.history]};records.set(filter._id,next);return next}}));
 t.mock.method(Account,'findById',()=>({lean:async()=>account(ID,'2026-11-01',50000000)}));
 t.mock.method(Agent,'find',()=>({select(){return this},lean:async()=>[{_id:A},{_id:B}]}));
 const user={_id:A,username:'admin',role:'ADMIN'},res={json(r){this.body=r}},next=e=>{throw e};
 const common={confirmed:true,reason:'Approved planning review',expectedVersion:0};
 const target={periodType:'MONTH',period:'2026-11',scope:'COMPANY',valueCents:100000,units:1};
 const key=targetKey(target.periodType,target.period,target.scope);
 await saveSalesTarget({user,params:{key},body:{...common,...target}},res,next);assert.equal(res.body.data.version,1);
 await assert.rejects(()=>saveSalesTarget({user,params:{key},body:{...common,...target}},res,next),/changed/);
 await saveSalesTarget({user,params:{key},body:{...common,...target,expectedVersion:1,active:false}},res,next);assert.equal(res.body.data.history[1].previous.active,true);assert.equal(res.body.data.value.active,false);
 await saveSalesAttribution({user,params:{id:ID},body:{...common,shares:approved}},res,next);assert.equal(res.body.data.value.shares.length,2);assert.equal(res.body.data.history[0].actor.username,'admin');
 await assert.rejects(()=>saveSalesAttribution({user,params:{id:ID},body:{...common,shares:approved}},res,next),/changed/);
});
