import test from "node:test";
import assert from "node:assert/strict";
import PropertyAssignment from "../src/models/PropertyAssignment.js";
import Property from "../src/models/Property.js";
import Project from "../src/models/Project.js";
import Client from "../src/models/Client.js";
import SequenceCounter from "../src/models/SequenceCounter.js";
import ActivityLog from "../src/models/ActivityLog.js";
import Expense from "../src/models/Expense.js";
import { acceptPayment, assignProperty, createExpense } from "../src/controllers/financeController.js";
import { moneyCents, buildSchedule, summarizeAccount, validDate, dateRange, today } from "../src/utils/accounting.js";
const id = "507f1f77bcf86cd799439011", propertyId = "507f1f77bcf86cd799439012";
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const req = body => ({ params: { id }, get: () => "test", user: { _id: id }, body });
const next = e => { throw e; };
const account = () => ({ _id: id, client: id, project: id, property: propertyId, contract: { totalCents: 120000, months: 12, contractDate: "2026-01-01", firstDueDate: "2026-01-31", schedule: buildSchedule(120000,12,"2026-01-31") }, payments: [] });
test.beforeEach(t => {
 t.mock.method(ActivityLog, "create", async () => ({}));
 t.mock.method(SequenceCounter, "findOneAndUpdate", async () => ({ value: 1 }));
});
test("money conversion rejects unsafe/invalid amounts and keeps exact cent values", () => {
 assert.equal(moneyCents("100.25"),10025);
 for (const value of ["",null,-1,Infinity,"one",1.234]) assert.throws(()=>moneyCents(value));
});
test("schedule totals equal contract including down payment, rounding and month ends", () => {
 const schedule=buildSchedule(100001,12,"2028-01-31",10000,"2028-01-01");
 assert.equal(schedule.reduce((n,r)=>n+r.amountCents,0),100001);
 assert.equal(schedule[0].installment,0);assert.equal(schedule[2].dueDate,"2028-02-29");assert.equal(schedule[3].dueDate,"2028-03-31");
 assert.throws(()=>buildSchedule(100,0,"2026-01-01"));
 assert.throws(()=>buildSchedule(100,12,"2026-01-01",101));
 assert.equal(validDate("2026-02-30"),false);
 assert.throws(()=>dateRange({from:"2026-03-01",to:"2026-01-01"}));
});
test("partial payments allocate oldest first and warnings do not forfeit or add guessed penalties", () => {
 const a=account();a.payments=[{amountCents:15000,paymentDate:"2026-02-01"},{amountCents:10000,paymentDate:"2026-09-01"}];
 const summary=summarizeAccount(a,"2026-04-15");
 assert.equal(summary.paidCents,15000);assert.equal(summary.balanceCents,105000);
 assert.equal(summary.schedule[0].balanceCents,0);assert.equal(summary.schedule[1].balanceCents,5000);
 assert.equal(summary.missedMonths,2);assert.equal(summary.alert,"WARNING");
 assert.equal(summarizeAccount(a,"2026-05-15").alert,"FORFEITURE_REVIEW");
 assert.equal(a.payments.length,2);assert.equal(Object.hasOwn(summary,"penaltyCents"),false);
});
function paymentBody(){return {accountId:id,requestId:"request-payment-1234",amount:"100.00",paymentDate:"2026-02-01",method:"CASH",reference:"R1",notes:""};}
function active(t){t.mock.method(Client,"findById",async()=>({status:"ACTIVE"}));t.mock.method(Project,"findById",async()=>({status:"ACTIVE"}));}
test("payment posting atomically protects balance and submission ID",async t=>{
 const a=account();active(t);t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>a}));
 t.mock.method(PropertyAssignment,"findOneAndUpdate",(filter,update)=>{
  assert.deepEqual(filter["payments.requestId"],{$ne:"request-payment-1234"});
  assert.deepEqual(filter.$expr,{$lte:[{$add:[{$sum:"$payments.amountCents"},10000]},"$contract.totalCents"]});
  assert.equal(update.$push.payments.amountCents,10000);a.payments.push(update.$push.payments);return {lean:async()=>a};
 });
 const res=response();await acceptPayment(req(paymentBody()),res,next);assert.equal(res.code,201);assert.equal(res.body.summary.balanceCents,110000);
});
test("network retry returns original payment without another write",async t=>{
 const a=account(),body=paymentBody();a.payments=[{requestId:body.requestId,amountCents:10000,paymentDate:body.paymentDate,method:body.method,reference:body.reference,notes:"",paymentId:"PAY-1"}];
 t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>a}));
 const write=t.mock.method(PropertyAssignment,"findOneAndUpdate",()=>{throw Error("Must not write")});
 let res=response();await acceptPayment(req(body),res,next);assert.equal(res.body.data.paymentId,"PAY-1");assert.equal(write.mock.callCount(),0);
 await assert.rejects(()=>acceptPayment(req({...body,amount:"101"}),response(),next),/already used/);
});
test("a concurrent duplicate posts once, while an overpayment is rejected",async t=>{
 active(t);const a=account(),body=paymentBody();let reads=0;
 t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>{reads++;return a}}));
 t.mock.method(PropertyAssignment,"findOneAndUpdate",()=>({lean:async()=>null}));
 await assert.rejects(()=>acceptPayment(req(body),response(),next),/exceeds/);
 assert.equal(reads,2);
});
test("inactive clients cannot receive payments",async t=>{
 const a=account();t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>a}));
 t.mock.method(Client,"findById",async()=>({status:"INACTIVE"}));t.mock.method(Project,"findById",async()=>({status:"ACTIVE"}));
 await assert.rejects(()=>acceptPayment(req(paymentBody()),response(),next),/active client/);
});
test("assignment claims available lot and snapshots price and complete schedule",async t=>{
 active(t);t.mock.method(Property,"findById",async()=>({_id:propertyId,project:id,areaSqm:120,pricePerSqm:2500}));
 t.mock.method(PropertyAssignment,"exists",async()=>null);t.mock.method(PropertyAssignment,"init",async()=>{});
 t.mock.method(Property,"findOneAndUpdate",async(filter,update)=>{assert.equal(filter._id,propertyId);assert.deepEqual(filter.$or[0],{client:null,status:"AVAILABLE"});assert.equal(update.$set.client,id);return {_id:propertyId}});
 t.mock.method(PropertyAssignment,"create",async doc=>{assert.equal(doc.contract.totalCents,30000000);assert.equal(doc.contract.schedule.reduce((n,r)=>n+r.amountCents,0),30000000);return {...doc,_id:id}});
 const res=response();await assignProperty(req({propertyId,months:12,contractDate:"2026-01-01",firstDueDate:"2026-02-01",downPayment:"10000"}),res,next);assert.equal(res.code,201);
});
test("occupied lot does not create a second account",async t=>{
 active(t);t.mock.method(Property,"findById",async()=>({project:id,areaSqm:120,pricePerSqm:2500}));t.mock.method(PropertyAssignment,"exists",async()=>null);t.mock.method(PropertyAssignment,"init",async()=>{});
 t.mock.method(Property,"findOneAndUpdate",async()=>null);
 const create=t.mock.method(PropertyAssignment,"create",async()=>{throw Error("Must not create")});
 await assert.rejects(()=>assignProperty(req({propertyId,months:12,contractDate:"2026-01-01",firstDueDate:"2026-02-01"}),response(),next),/no longer available/);
 assert.equal(create.mock.callCount(),0);
});
test("expense replay does not create another expense and altered replay is rejected",async t=>{
 const body={requestId:"request-expense-1234",category:"OFFICE",expenseDate:today(),amount:"200",description:"Supplies",payee:"Store",reference:"R"};
 t.mock.method(Expense,"findOne",()=>({lean:async()=>({requestId:body.requestId,category:body.category,expenseDate:body.expenseDate,amountCents:20000,description:body.description,payee:body.payee,reference:body.reference,project:null})}));
 const create=t.mock.method(Expense,"create",async()=>{throw Error("Must not create")});
 const res=response();await createExpense(req(body),res,next);assert.match(res.body.message,/already recorded/);assert.equal(create.mock.callCount(),0);
 await assert.rejects(()=>createExpense(req({...body,amount:"201"}),response(),next),/different expense/);
});

test("assignment failure keeps the lot linked until a same-client retry can recover",async t=>{
 active(t);t.mock.method(Property,"findById",async()=>({_id:propertyId,project:id,areaSqm:120,pricePerSqm:2500}));
 t.mock.method(PropertyAssignment,"exists",async()=>null);t.mock.method(PropertyAssignment,"init",async()=>{});
 t.mock.method(Property,"findOneAndUpdate",async filter=>{assert.deepEqual(filter.$or[1],{client:id,status:"RESERVED"});return {_id:propertyId}});
 const undo=t.mock.method(Property,"updateOne",async()=>{throw Error("Must not unprotect an uncertain assignment")});
 let tries=0;t.mock.method(PropertyAssignment,"create",async doc=>{if(!tries++)throw Error("Network error");return {...doc,_id:id}});
 const request=req({propertyId,months:12,contractDate:"2026-01-01",firstDueDate:"2026-02-01"});
 await assert.rejects(()=>assignProperty(request,response(),next),/lot remains protected/);
 const res=response();await assignProperty(request,res,next);assert.equal(res.code,201);assert.equal(undo.mock.callCount(),0);
});

test("reports use payment/expense dates, project filters, and past-date balances",async t=>{
 const {report}=await import("../src/controllers/financeController.js");
 const chain=data=>({populate(){return this},sort(){return this},lean:async()=>data});
 const a=account();a.client={_id:id,firstName:"Ana"};a.project={_id:id,projectName:"Project"};a.property={_id:propertyId};
 a.payments=[{paymentId:"PAY-1",amountCents:10000,paymentDate:"2026-02-01"},{paymentId:"PAY-2",amountCents:20000,paymentDate:"2026-03-01"}];
 t.mock.method(PropertyAssignment,"find",()=>chain([a]));
 t.mock.method(Expense,"find",()=>chain([{_id:"expense1",amountCents:2500,expenseDate:"2026-02-01",project:{_id:id}},{_id:"expense2",amountCents:500,expenseDate:"2026-02-01",project:null}]));
 const res=response();await report({query:{from:"2026-02-01",to:"2026-02-28",project:id}},res,next);
 assert.equal(res.body.data.collectedCents,10000);assert.equal(res.body.data.expenseCents,2500);assert.equal(res.body.data.netCents,7500);
 assert.equal(res.body.data.accounts[0].summary.paidCents,10000);assert.equal(res.body.data.asOf,"2026-02-28");
});
