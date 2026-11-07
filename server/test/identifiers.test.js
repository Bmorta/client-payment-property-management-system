import test from "node:test";
import assert from "node:assert/strict";
import Client from "../src/models/Client.js";
import PropertyAssignment from "../src/models/PropertyAssignment.js";
import SequenceCounter from "../src/models/SequenceCounter.js";
import ActivityLog from "../src/models/ActivityLog.js";
import { generateRecordId } from "../src/utils/generateRecordId.js";
import { createClient, updateClient } from "../src/controllers/clientController.js";
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function counters(t, initial = {}) {
 const values = { ...initial };
 t.mock.method(SequenceCounter,"findOneAndUpdate",async ({_id}, update) => {
  if (update.$max) values[_id] = Math.max(values[_id] || 0, update.$max.value);
  if (update.$inc) values[_id] = (values[_id] || 0) + update.$inc.value;
  return {value:values[_id]};
 });
 return values;
}
test("concurrent allocations advance beyond historical client IDs without lowering counters",async t=>{
 t.mock.method(Client,"aggregate",async pipeline=>{
  assert.equal(pipeline[0].$match.clientId.$regex,"^(CL|CLT)-[0-9]+$");
  return [{value:121}];
 });
 const values=counters(t,{client:150});
 const ids=await Promise.all(Array.from({length:20},()=>generateRecordId("client")));
 assert.equal(new Set(ids).size,20);assert.ok(ids.includes("CL-000151"));assert.equal(values.client,170);
});
test("payment IDs reconcile history while external receipts cannot be generated",async t=>{
 t.mock.method(PropertyAssignment,"aggregate",async pipeline=>{
  assert.deepEqual(pipeline[0],{$unwind:"$payments"});
  return [{value:pipeline[1].$match["payments.receiptNumber"]?52:80}];
 });
 counters(t);
 assert.equal(await generateRecordId("payment"),"PAY-000081");
 await assert.rejects(generateRecordId("receipt"),/Unknown record ID/);
});
test("new clients receive a server ID even if caller supplies one",async t=>{
 t.mock.method(Client,"aggregate",async()=>[{value:20}]);counters(t);
 t.mock.method(ActivityLog,"create",async()=>({}));
 t.mock.method(Client,"create",async data=>{assert.equal(data.clientId,"CL-000021");return {...data,_id:"client"}});
 const res=response();await createClient({body:{clientId:"CUSTOM",firstName:"Ana",lastName:"Morta"},user:{_id:"actor"}},res,e=>{throw e});
 assert.equal(res.code,201);assert.equal(res.body.data.clientId,"CL-000021");
});
test("existing client IDs cannot be changed through update API",async t=>{
 const old={clientId:"OFFICE-123"};t.mock.method(Client,"findById",async()=>old);
 const res=response();await updateClient({params:{id:"client"},body:{clientId:"CL-999999"}},res,e=>{throw e});
 assert.equal(res.code,400);assert.equal(old.clientId,"OFFICE-123");
 assert.equal(Client.schema.path("clientId").options.immutable,true);
 const paymentSchema=PropertyAssignment.schema.path("payments").schema;
 assert.equal(paymentSchema.path("receiptNumber").options.immutable,true);
 assert.equal(paymentSchema.path("paymentId").options.immutable,true);
});
