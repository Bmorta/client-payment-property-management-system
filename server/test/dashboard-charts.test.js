import test from 'node:test';
import assert from 'node:assert/strict';
import {dashboardCharts} from '../src/utils/dashboardCharts.js';
const payment=(paymentId,amountCents,paymentDate)=>({paymentId,amountCents,paymentDate});
test('dashboard totals use corrected effective payments, exclude voids and honor inclusive dates',()=>{
 const accounts=[{payments:[payment('old',999,'2026-04-30'),payment('first',10001,'2026-05-01'),{...payment('corrected',10000,'2026-06-03'),revisions:[{values:{amountCents:25001}}]},{...payment('void',50000,'2026-06-04'),revisions:[{values:{voided:true}}]},payment('future',123,'2026-07-02')]}];
 const expenses=[{amountCents:250,expenseDate:'2026-05-01'},{amountCents:501,expenseDate:'2026-07-01'},{amountCents:900,expenseDate:'2026-07-02'}];
 const before=JSON.stringify(accounts);
 assert.deepEqual(dashboardCharts(accounts,expenses,'2026-05-01','2026-07-01'),[{month:'2026-05',collectionsCents:10001,expensesCents:250},{month:'2026-06',collectionsCents:25001,expensesCents:0},{month:'2026-07',collectionsCents:0,expensesCents:501}]);assert.equal(JSON.stringify(accounts),before);
});
test('dashboard includes zero months and crosses years without fabricating data',()=>assert.deepEqual(dashboardCharts([],[],'2025-12-01','2026-01-15'),[{month:'2025-12',collectionsCents:0,expensesCents:0},{month:'2026-01',collectionsCents:0,expensesCents:0} ]));

test('dashboard endpoint applies project to both queries and rejects invalid inputs',async t=>{
 const {dashboardAnalytics}=await import('../src/controllers/financeController.js');
 const {default:PropertyAssignment}=await import('../src/models/PropertyAssignment.js');
 const {default:Expense}=await import('../src/models/Expense.js');
 const seen=[];t.mock.method(PropertyAssignment,'find',filter=>{seen.push(['accounts',filter]);return {select(){return {lean:async()=>[]}}}});
 t.mock.method(Expense,'find',filter=>{seen.push(['expenses',filter]);return {select(){return {lean:async()=>[]}}}});
 const project='507f1f77bcf86cd799439011',response={json(v){this.body=v}},next=e=>{throw e};
 await dashboardAnalytics({query:{from:'2026-10-01',to:'2026-11-06',project}},response,next);
 assert.equal(seen[0][1].project,project);assert.equal(seen[1][1].project,project);assert.deepEqual(seen[1][1].expenseDate,{$gte:'2026-10-01',$lte:'2026-11-06'});assert.equal(response.body.data.months.length,2);
 await assert.rejects(dashboardAnalytics({query:{from:'2026-10-01',to:'2026-11-06',project:'bad'}},response,next),/Invalid identifier/);
 await assert.rejects(dashboardAnalytics({query:{from:'bad',to:'2026-11-06'}},response,next));
});
