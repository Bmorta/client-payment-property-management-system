import test from "node:test";
import assert from "node:assert/strict";
import PropertyAssignment from "../src/models/PropertyAssignment.js";
import {correctPayment,decideCorrection} from "../src/controllers/paymentCorrectionController.js";
import {allocatePayments,effectivePayment} from "../src/utils/paymentLedger.js";
import {summarizeAccount} from "../src/utils/accounting.js";
import {notificationData,readNotifications} from "../src/controllers/notificationController.js";
import {searchClients} from "../src/controllers/clientSearchController.js";
import Client from "../src/models/Client.js";
const id="507f1f77bcf86cd799439011",staff="507f1f77bcf86cd799439012";
const account=()=>({_id:id,__v:0,contract:{totalCents:120000,months:2,contractDate:"2026-01-01",schedule:[{installment:0,dueDate:"2026-01-01",amountCents:20000},{installment:1,dueDate:"2026-02-01",amountCents:50000},{installment:2,dueDate:"2026-03-01",amountCents:50000}]},payments:[{paymentId:"PAY-000001",receiptNumber:"RCT-000001",requestId:"original-request-123",amountCents:30000,paymentDate:"2026-01-05",method:"CASH",reference:"old",notes:""}],correctionRequests:[],notifications:[]});
const response=()=>({code:200,status(c){this.code=c;return this},json(b){this.body=b;return this}});
const req=(role="STAFF",body={})=>({params:{id,paymentId:"PAY-000001"},user:{_id:role==="STAFF"?staff:id,username:role.toLowerCase(),role},body:{amount:"400",paymentDate:"2026-01-05",method:"CASH",type:"AUTO",notes:"",reason:"Correct cash count",baseRevision:0,requestId:"correction-request-1234",...body}});
const next=e=>{throw e};
function mockAccount(t,a){t.mock.method(PropertyAssignment,"findById",()=>({lean:async()=>structuredClone(a)}));return t.mock.method(PropertyAssignment,"findOneAndUpdate",(filter,update)=>({lean:async()=>{assert.equal(filter.__v,a.__v);Object.assign(a,update.$set);if(update.$push["payments.$[ledgerPayment].revisions"])a.payments[0].revisions=[...(a.payments[0].revisions||[]),...update.$push["payments.$[ledgerPayment].revisions"].$each];a.__v++;a.auditEvents=[...(a.auditEvents||[]),...(update.$push.auditEvents.$each||[update.$push.auditEvents])];return structuredClone(a)}}))}
test("partial and advance payments count covered months, exclude down payment, and expose allocations",()=>{
 const a=account();a.payments.push({paymentId:"PAY-2",amountCents:50000,paymentDate:"2026-01-06",type:"INSTALLMENT"});
 const s=summarizeAccount(a,"2026-02-10");assert.equal(s.downPaymentPaidCents,20000);assert.equal(s.fullyPaidMonths,1);assert.equal(s.partialMonths,1);assert.equal(s.remainingMonths,1);assert.equal(s.progressPercent,50);
 assert.equal(allocatePayments(a).allocations["PAY-2"][1].amountCents,10000);
});
test("typed down payments cannot overflow into installment balance",()=>{const a=account();a.payments[0].type="DOWN_PAYMENT";assert.throws(()=>allocatePayments(a),/payment type/)});
test("staff correction persists pending request without modifying original ledger or balance",async t=>{
 const a=account(),original=JSON.stringify(a.payments);mockAccount(t,a);const res=response();await correctPayment(req(),res,next);
 assert.equal(res.code,201);assert.equal(JSON.stringify(a.payments),original);assert.equal(a.correctionRequests[0].status,"PENDING");assert.equal(a.notifications[0].recipient,"ADMIN");assert.equal(summarizeAccount(a).paidCents,30000);
 assert.equal(a.auditEvents[0].action,"PAYMENT_CORRECTION_REQUESTED");
 await correctPayment(req(),response(),next);assert.equal(a.correctionRequests.length,1);
 await assert.rejects(()=>correctPayment(req("STAFF",{amount:"450"}),response(),next),/already used/);
 await assert.rejects(()=>correctPayment(req("STAFF",{requestId:"different-request-123"}),response(),next),/pending correction/);
});
test("admin direct correction requires confirmation and preserves original values and IDs",async t=>{
 const a=account();mockAccount(t,a);await assert.rejects(()=>correctPayment(req("ADMIN"),response(),next),/Confirm/);
 await correctPayment(req("ADMIN",{confirm:true}),response(),next);
 assert.equal(a.payments[0].amountCents,30000);assert.equal(effectivePayment(a.payments[0]).amountCents,40000);assert.equal(a.payments[0].receiptNumber,"RCT-000001");assert.equal(a.payments[0].revisions[0].previousValues.amountCents,30000);
 await correctPayment(req("ADMIN",{confirm:true}),response(),next);assert.equal(a.payments[0].revisions.length,1);
});
async function pending(t,a){mockAccount(t,a);await correctPayment(req(),response(),next);return a.correctionRequests[0]}
function decision(r,status="APPROVED"){return {params:{id,requestId:r.requestId},user:{_id:id,username:"admin",role:"ADMIN"},body:{decision:status,reason:"Reviewed receipt",confirm:true}}}
test("approval applies exactly one revision and notifies requesting staff",async t=>{
 const a=account(),r=await pending(t,a);await decideCorrection(decision(r),response(),next);
 assert.equal(a.correctionRequests[0].status,"APPROVED");assert.equal(a.payments[0].revisions.length,1);assert.equal(summarizeAccount(a).paidCents,40000);assert.equal(a.notifications.at(-1).recipient,staff);
 await decideCorrection(decision(r),response(),next);assert.equal(a.payments[0].revisions.length,1);
});
test("rejection keeps original ledger unchanged",async t=>{const a=account(),r=await pending(t,a);await decideCorrection(decision(r,"REJECTED"),response(),next);assert.equal(a.correctionRequests[0].status,"REJECTED");assert.equal(a.payments[0].revisions,undefined);assert.equal(summarizeAccount(a).paidCents,30000)});
test("changed source values cause stale approval rather than overwrite",async t=>{const a=account(),r=await pending(t,a);a.payments[0].notes="Changed outside request";await decideCorrection(decision(r),response(),next);assert.equal(a.correctionRequests[0].status,"STALE");assert.equal(a.payments[0].revisions,undefined)});
test("void retains original transaction and removes amount from effective balance",async t=>{const a=account();mockAccount(t,a);await correctPayment(req("ADMIN",{confirm:true,voided:true}),response(),next);assert.equal(a.payments[0].amountCents,30000);assert.equal(effectivePayment(a.payments[0]).status,"VOIDED");assert.equal(summarizeAccount(a).paidCents,0)});
test("overpayment correction and stale base revision never write",async t=>{const a=account(),write=mockAccount(t,a);await assert.rejects(()=>correctPayment(req("ADMIN",{confirm:true,amount:"1300"}),response(),next),/exceeds/);await assert.rejects(()=>correctPayment(req("ADMIN",{confirm:true,baseRevision:2}),response(),next),/changed/);assert.equal(write.mock.callCount(),0)});
test("notification reads expose only own or admin-role notifications",async t=>{const a=account();a.notifications=[{id:"own",recipient:staff,readBy:[]},{id:"admin",recipient:"ADMIN",readBy:[]},{id:"other",recipient:"another",readBy:[]}];t.mock.method(PropertyAssignment,"find",()=>({select:()=>({lean:async()=>[a]})}));assert.deepEqual((await notificationData({_id:staff,role:"STAFF"})).rows.map(n=>n.id),["own"]);let filter;t.mock.method(PropertyAssignment,"updateMany",async(f,u,o)=>{filter=o.arrayFilters[0];return {}});await readNotifications({user:{_id:staff,role:"STAFF"},params:{notificationId:"admin"}},response(),next);assert.deepEqual(filter["n.recipient"],{$in:[staff,"STAFF"]})});
test("client search paginates in MongoDB without projecting financial ledgers",async t=>{t.mock.method(Client,"aggregate",async pipeline=>{const facet=pipeline.at(-1).$facet;assert.deepEqual(facet.rows[0],{$skip:20});assert.equal(facet.rows.at(-1).$project.payments,undefined);return [{rows:[{clientId:"CL-1"}],total:[{count:21}]}]});const res=response();await searchClients({query:{q:"Ana",page:"2"}},res,next);assert.equal(res.body.total,21);assert.equal(res.body.page,2);assert.equal(res.body.data.length,1)});
