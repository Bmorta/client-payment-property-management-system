import test from "node:test";
import assert from "node:assert/strict";
import { auditValues } from "../src/utils/auditValues.js";
import { auditMutation } from "../src/middleware/auditMutation.js";
import { listActivity } from "../src/controllers/activityController.js";
import { authorize } from "../src/middleware/authorize.js";
import { updateAgreement } from "../src/controllers/financeController.js";
import { buildSchedule, validTerm } from "../src/utils/accounting.js";
import ActivityLog from "../src/models/ActivityLog.js";
import PropertyAssignment from "../src/models/PropertyAssignment.js";
import Project from "../src/models/Project.js";
const id="507f1f77bcf86cd799439011";
const response=()=>({code:200,statusCode:200,status(code){this.code=code;this.statusCode=code;return this},json(body){this.body=body;return this}});
const req=()=>({method:"PATCH",baseUrl:"/api/finance",path:`/accounts/${id}/agreement`,params:{id},user:{_id:id,username:"admin1",role:"ADMIN"},get:()=>"test",body:{months:18,termType:"CUSTOM",downPayment:"60000",firstDueDate:"2026-12-01",expectedVersion:2,confirmScheduleReplacement:true}});
const account=()=>({_id:id,__v:2,project:id,contract:{totalCents:60000000,months:36,termType:"PREDEFINED",contractDate:"2026-11-01",firstDueDate:"2026-12-01",downPaymentCents:6000000,schedule:buildSchedule(60000000,36,"2026-12-01",6000000,"2026-11-01")},payments:[{paymentId:"PAY-1",amountCents:6000000,paymentDate:"2026-11-01"}]});
const next=e=>{throw e};
test("custom terms validate positive whole months and preserve exact scheduled totals",()=>{
 for(const term of [12,24,36,48,60,18,1,1200]){const s=buildSchedule(60000001,term,"2026-12-31",6000000,"2026-11-01");assert.equal(s.reduce((n,r)=>n+r.amountCents,0),60000001)}
 for(const term of [0,-1,1.5,NaN,Infinity,1201,"18"])assert.equal(validTerm(term),false);
 const installments=buildSchedule(60000000,18,"2026-12-01",6000000,"2026-11-01").filter(s=>s.installment);
 assert.equal(installments[0].amountCents,3000000);assert.equal(installments.at(-1).dueDate,"2028-05-01");
});
test("audit values strip secrets recursively without losing ordinary values",()=>{
 const sanitized=auditValues({password:"bad",passwordHash:"hash",nested:{token:"t",before:{price:100}},cookies:"x",old:[{secretKey:"s",term:18}]});
 assert.deepEqual(sanitized,{nested:{before:{price:100}},old:[{term:18}]});
});
test("audit outage blocks mutation before controller execution",async t=>{
 t.mock.method(PropertyAssignment,"find",()=>({lean:async()=>[account()]}));
 t.mock.method(ActivityLog,"create",async()=>{throw Error("Offline")});let ran=false;const res=response();
 await auditMutation(req(),res,()=>{ran=true});assert.equal(ran,false);assert.equal(res.code,503);
});
test("audit persists before values before mutation, then records sanitized completion",async t=>{
 const request=req(),res=response();request.body.password="never log";
 t.mock.method(PropertyAssignment,"find",()=>({lean:async()=>[account()]}));
 let started=false;
 t.mock.method(ActivityLog,"create",async event=>{assert.equal(event.outcome,"PENDING");assert.equal(event.username,"admin1");assert.equal(event.metadata.requestedValues.password,undefined);assert.equal(event.previousValues[0].contract.months,36);started=true;return {_id:id}});
 let completion;
 t.mock.method(ActivityLog,"updateOne",async(filter,update)=>{completion=update.$set});
 await auditMutation(request,res,()=>{assert.equal(started,true)});
 await res.json({success:true,data:{_id:id},message:"Agreement saved"});
 assert.equal(completion.outcome,"SUCCEEDED");assert.equal(completion.metadata.requestedValues.password,undefined);assert(res.body.success);
});
test("failed completion retains a pending entry and reports audit warning",async t=>{
 t.mock.method(PropertyAssignment,"find",()=>({lean:async()=>[account()]}));t.mock.method(ActivityLog,"create",async()=>({_id:id}));t.mock.method(ActivityLog,"updateOne",async()=>{throw Error("Offline")});
 const res=response();await auditMutation(req(),res,()=>{});await res.json({success:true,data:{_id:id}});
 assert(res.body.auditWarning);assert.equal(res.body.success,true);
});
test("activity log date ranges use Philippine boundaries and pagination",async t=>{
 let captured;
 t.mock.method(ActivityLog,"countDocuments",async filter=>{captured=filter;return 21});
 const chain={populate(){return this},sort(){return this},skip(n){assert.equal(n,20);return this},limit(n){assert.equal(n,20);return this},lean:async()=>[]};
 t.mock.method(ActivityLog,"find",()=>chain);
 const res=response();await listActivity({query:{page:"2",limit:"20",from:"2026-11-04",to:"2026-11-04",module:"Lots"}},res,next);
 assert.equal(captured.createdAt.$gte.toISOString(),"2026-11-03T16:00:00.000Z");assert.equal(captured.createdAt.$lte.toISOString(),"2026-11-04T15:59:59.999Z");assert.equal(res.body.pagination.pages,2);
});
test("audit access is denied to staff and viewers",()=>{
 for(const role of ["STAFF","VIEWER"]){const res=response();let nextCalled=false;authorize("ADMIN")({user:{role}},res,()=>{nextCalled=true});assert.equal(res.code,403);assert.equal(nextCalled,false)}
});
test("agreement changes atomically preserve old version and audit without touching payments",async t=>{
 const a=account(),paymentCopy=JSON.stringify(a.payments);t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>a}));t.mock.method(Project,"findById",async()=>({status:"ACTIVE"}));t.mock.method(ActivityLog,"create",async()=>({}));
 let write;t.mock.method(PropertyAssignment,"findOneAndUpdate",(filter,update)=>{assert.equal(filter.__v,2);write=update;return {lean:async()=>({...a,contract:{...a.contract,...Object.fromEntries(Object.entries(update.$set).filter(([k])=>k.startsWith("contract.")).map(([k,v])=>[k.slice(9),v]))}})}});
 const res=response();await updateAgreement(req(),res,next);
 assert.equal(write.$set["contract.months"],18);assert.equal(write.$set["contract.termType"],"CUSTOM");assert.equal(write.$set["contract.totalCents"],undefined); // price and unrelated contract metadata are never rewritten
 assert.equal(write.$push.agreementHistory.contract.months,36);assert.equal(write.$push.auditEvents.$each.find(e=>e.action==="AGREEMENT_UPDATED").previousValues.months,36);assert.equal(write.$push.auditEvents.$each.find(e=>e.action==="AGREEMENT_UPDATED").updatedValues.months,18);
 assert.equal(Object.hasOwn(write.$set,"payments"),false);assert.equal(JSON.stringify(a.payments),paymentCopy);
});
test("agreement confirmation and concurrency are enforced",async t=>{
 const request=req();request.body.confirmScheduleReplacement=false;await assert.rejects(()=>updateAgreement(request,response(),next),/explicitly confirm/);
 t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>account()}));t.mock.method(Project,"findById",async()=>({status:"ACTIVE"}));t.mock.method(PropertyAssignment,"findOneAndUpdate",()=>({lean:async()=>null}));
 await assert.rejects(()=>updateAgreement(req(),response(),next),/account or its payments changed/);
});


test("historical reports keep the schedule version that existed at the cutoff",async()=>{
 const {summarizeAccount}=await import("../src/utils/accounting.js");
 const oldContract={totalCents:120000,months:12,contractDate:"2026-01-01",schedule:buildSchedule(120000,12,"2026-02-01")};
 const a={contract:{...oldContract,months:24,schedule:buildSchedule(120000,24,"2026-02-01")},payments:[],agreementHistory:[{contract:oldContract,replacedAt:"2026-07-01T00:00:00.000Z"}]};
 assert.equal(summarizeAccount(a,"2026-05-01").schedule.length,12);
 assert.equal(summarizeAccount(a,"2026-08-01").schedule.length,24);
});
