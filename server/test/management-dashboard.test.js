import test from 'node:test';
import assert from 'node:assert/strict';
import { managementMetrics, agingGroup } from '../src/utils/managementDashboard.js';
import { financialRows } from '../src/utils/financialReporting.js';
import { buildSchedule } from '../src/utils/accounting.js';

const today='2026-11-18', from='2026-11-01', to='2026-11-30';
const properties=[{_id:'lot1',project:'A',status:'RESERVED'},{_id:'lot2',project:'A',status:'SOLD'},{_id:'lot3',project:'B',status:'AVAILABLE'}];
const terms={effectiveDate:'2026-10-01',dueDay:5,graceDays:5,penaltyRateBps:300,penaltyPercentage:3,penaltyBasis:'FULL_INSTALLMENT',allocationPriority:'PRINCIPAL_FIRST',penaltyStatus:'ACTIVE',frequency:'MONTHLY',forfeitureMonths:3,criticalMonths:2,reminderDays:3};
const paid=(id,amount,date,extras={})=>({paymentId:id,amountCents:amount,paymentDate:date,method:'CASH',...extras});
const account=(i,first,payments=[])=>({_id:'a'+i,assignmentId:'CTR-'+i,property:'lot'+i,client:'same-client',clientStatus:'ACTIVE',project:'A',lifecycle:'ACTIVE',penaltyCalculationRule:'CURRENT_OVERDUE',payments,contract:{contractDate:'2026-10-01',totalCents:60000,downPaymentCents:0,months:6,firstDueDate:first,monitoringTerms:terms,schedule:buildSchedule(60000,6,first,0,'2026-10-01')}});
const input=(accounts)=>({accounts,properties,financial:{...financialRows(accounts,[]),refunds:[],entries:[{entryId:'open',kind:'OPENING',status:'POSTED',effectiveDate:'2026-10-01',amountCents:20000},{entryId:'turn',kind:'OWNER_TURNOVER',status:'POSTED',effectiveDate:today,amountCents:2000}]},from,to,today,permissions:{operations:true,financial:true}});
test('dashboard counts buyers once, separates overdue principal from penalty and tracks grace-based age',()=>{
 const rows=[account(1,'2026-11-18'),account(2,'2026-11-18'),account(3,'2026-11-05')];
 const d=managementMetrics(input(rows));
 assert.equal(d.receivables.unavailable,0);
 assert.equal(d.receivables.activeClients,1);
 assert.equal(d.activeContracts,3);
 assert.equal(d.receivables.dueClients,1);
 assert.equal(d.receivables.dueToday,20000);
 assert.equal(d.receivables.overdueCents,10000);
 assert.equal(d.receivables.aging[0].amount,10000);
 assert.equal(d.receivables.expected,30000);
 assert.equal(agingGroup({graceEnd:'2026-10-19'},today),0);
 assert.equal(agingGroup({graceEnd:'2026-10-18'},today),1);
});
test('verified office cash stays office-wide while scoped actual collections honor posting and effective date',()=>{
 const rows=[account(1,'2026-11-05',[paid('posted',10000,today),paid('void',5000,today,{revisions:[{values:{voided:true}}]})]),account(2,'2026-11-05',[paid('bank',10000,today,{method:'BANK_TRANSFER'}),paid('future',90000,'2026-11-25')])];
 const params=input(rows);
 const d=managementMetrics({...params,properties:[properties[0]],inventoryScoped:true});
 assert.equal(d.finance.todayCollections,10000);
 assert.equal(d.finance.periodCollections,10000);
 assert.equal(d.finance.cash.closing,28000);
 assert.equal(d.finance.cash.events.OWNER_TURNOVER,2000);
 assert.equal(d.months[0].cashOut,2000);
 assert.equal(d.months[0].cashIn,10000);
});
test('viewer excludes financial and client sections, staff receives operational metrics only',()=>{
 const params=input([account(1,'2026-11-05')]);
 for(const operations of [true,false]){
  const d=managementMetrics({...params,financial:null,permissions:{operations,financial:false}});
  assert.equal(d.finance,undefined);
  assert.equal(d.commissions,undefined);
  assert.equal(!!d.receivables,operations);
 }
});

test('dashboard endpoint does not query financial sources for staff or viewers',async t=>{
 const {managementDashboard}=await import('../src/controllers/managementDashboardController.js');
 const models=Object.fromEntries(await Promise.all(['Project','Property','PropertyAssignment','Client','SiteRequest','Expense','OfficePayout','CancellationCase','CashLedgerEntry'].map(async name=>[name,(await import('../src/models/'+name+'.js')).default])));
 const called=[];
 for(const [name,Model] of Object.entries(models)){
  t.mock.method(Model,'find',()=>{called.push(name);return {select(){return this;},sort(){return this;},lean:async()=>[]};});
 }
 const response={set(){return this;},json(body){this.body=body;}};
 for(const role of ['STAFF','VIEWER']){
  await managementDashboard({query:{from,to},user:{role}},response,error=>{throw error;});
  assert.equal(response.body.data.finance,undefined);
  assert.equal(response.body.data.obligations,undefined);
  assert.equal(!!response.body.data.requests,role==='STAFF');
 }
 assert.ok(!called.some(name=>['CashLedgerEntry','Expense','OfficePayout','CancellationCase'].includes(name)));
 await assert.rejects(managementDashboard({query:{from,to,phase:'1.5'},user:{role:'ADMIN'}},response,error=>{throw error;}),/valid inventory filters/);
});
