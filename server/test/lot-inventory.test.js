import OfficePayout from "../src/models/OfficePayout.js";
import Phase from "../src/models/Phase.js";
import Block from "../src/models/Block.js";
import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import SequenceCounter from "../src/models/SequenceCounter.js";
import PropertyAssignment from "../src/models/PropertyAssignment.js";
import Project from "../src/models/Project.js";
import Property from "../src/models/Property.js";
import { deleteLot, deleteLots } from "../src/controllers/structureController.js";
import { generateProjectProperties, updateProjectProperties } from "../src/controllers/propertyController.js";
import { validPrice, lotPrice } from "../src/utils/lotPricing.js";

const projectId = "507f1f77bcf86cd799439011";
const ids = ["507f1f77bcf86cd799439012", "507f1f77bcf86cd799439013"];
test.beforeEach(t=>{for(const model of [Phase,Block,Property])t.mock.method(model,"aggregate",async()=>[])});
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const req = (body = {}) => ({ params: { projectId }, body, user: { _id: projectId } });
const next = error => { throw error; };
test.beforeEach(t => { t.mock.method(PropertyAssignment, "exists", async () => null);t.mock.method(OfficePayout,"exists",async()=>null); });

// No MongoDB connection: mock persistence and assert that unsafe requests never delete.
for (const [name, lots, code] of [
  ["linked client", [{ _id: ids[0], status: "AVAILABLE", client: projectId }, { _id: ids[1], status: "AVAILABLE" }], 409],
  ["reserved lot", [{ _id: ids[0], status: "RESERVED" }, { _id: ids[1], status: "AVAILABLE" }], 409],
  ["for-assume lot", [{ _id: ids[0], status: "FOR_ASSUME" }, { _id: ids[1], status: "AVAILABLE" }], 409],
  ["sold lot", [{ _id: ids[0], status: "SOLD" }, { _id: ids[1], status: "AVAILABLE" }], 409],
  ["missing or cross-project lot", [{ _id: ids[0], status: "AVAILABLE" }], 404]
]) test(`bulk deletion rejects ${name} before any deletion`, async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "find", filter => {
    assert.equal(filter.project, projectId);
    return { lean: async () => lots };
  });
  const remove = t.mock.method(Property, "deleteMany", async () => { throw new Error("Must not delete"); });
  const res = response(); await deleteLots(req({ ids }), res, next);
  assert.equal(res.code, code); assert.equal(remove.mock.callCount(), 0);
});

test("eligible deletion checks availability and client link again at write time", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "find", () => ({ lean: async () => ids.map(_id => ({ _id, status: "AVAILABLE", client: null })) }));
  t.mock.method(Property, "deleteMany", async filter => {
    assert.deepEqual(filter, { _id: { $in: ids }, project: projectId, status: "AVAILABLE", client: null });
    return { deletedCount: 1 }; // Another lot became reserved or linked after validation.
  });
  const res = response(); await deleteLots(req({ ids }), res, next);
  assert.equal(res.body.deletedCount, 1); assert.match(res.body.message, /were kept/);
});

test("single deletion also rejects a client-linked available lot", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "find", () => ({ lean: async () => [{ _id: ids[0], status: "AVAILABLE", client: projectId }] }));
  const remove = t.mock.method(Property, "deleteMany", async () => { throw Error("Must not delete"); });
  const request = req(); request.params.id = ids[0];
  const res = response(); await deleteLot(request, res, next);
  assert.equal(res.code, 409); assert.equal(remove.mock.callCount(), 0);
});

test("duplicate IDs and oversized deletion selections are rejected", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  const find = t.mock.method(Property, "find", () => { throw Error("Must not query lots"); });
  for (const selection of [[], [ids[0], ids[0]], ["bad"], Array.from({ length: 101 }, () => new mongoose.Types.ObjectId().toString())]) {
    const res = response(); await deleteLots(req({ ids: selection }), res, next); assert.equal(res.code, 400);
  }
  assert.equal(find.mock.callCount(), 0);
});

test("archived project cannot delete lots", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ARCHIVED" }));
  const remove = t.mock.method(Property, "deleteMany", async () => { throw Error("Must not delete"); });
  const res = response(); await deleteLots(req({ ids }), res, next);
  assert.equal(res.code, 409); assert.equal(remove.mock.callCount(), 0);
});

test("lot total is derived, blank rates remain unknown, and client link controls eligibility", () => {
  const lot = new Property({ areaSqm: 120, pricePerSqm: 2500, status: "AVAILABLE" });
  assert.equal(lot.toJSON().pricePerLot, 300000); assert.equal(lot.toJSON().canDelete, true);
  lot.areaSqm = 100.5; assert.equal(lot.toJSON().pricePerLot, 251250);
  lot.client = projectId; assert.equal(lot.toJSON().canDelete, false);
  lot.pricePerSqm = null; assert.equal(lot.toJSON().pricePerLot, null);
  assert.equal(lotPrice(120, 0), 0); assert.equal(lotPrice(100.5, 10.25), 1030.13);
  assert.equal(lotPrice(120, null), null);
  for (const invalid of [-1, NaN, Infinity, "2500", 1.234]) assert.equal(validPrice(invalid), false);
});

test("generation rejects malformed per-lot prices before insertion", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  const insert = t.mock.method(Property, "insertMany", async () => { throw Error("Must not insert"); });
  for (const prices of [[-1], [1.234], [Infinity], [1, 2]]) {
    const res = response(); await generateProjectProperties(req({ phases: [{ phaseNumber: 1, blocks: [{ blockNumber: 1, lotCount: 1, areasSqm: [120], pricesPerSqm: prices }] }] }), res, next);
    assert.equal(res.code, 400);
  }
  assert.equal(insert.mock.callCount(), 0);
});

test("batch edits persist rates and preserve omitted rates from older clients", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "countDocuments", async () => 1);
  const write = t.mock.method(Property, "bulkWrite", async () => ({ matchedCount: 1 }));
  let res = response(); await updateProjectProperties(req({ updates: [{ _id: ids[0], areaSqm: 120, status: "AVAILABLE", pricePerSqm: 2500, pricePerLot: 1 }] }), res, next);
  let saved = write.mock.calls[0].arguments[0][0].updateOne.update.$set;
  assert.equal(saved.pricePerSqm, 2500); assert.equal(saved.pricePerLot, undefined);
  res = response(); await updateProjectProperties(req({ updates: [{ _id: ids[0], areaSqm: 100, status: "AVAILABLE" }] }), res, next);
  saved = write.mock.calls[1].arguments[0][0].updateOne.update.$set;
  assert.equal(Object.hasOwn(saved, "pricePerSqm"), false);
});


test("generated lots persist each rate and derive each lot total independently", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "findOne", () => ({ lean: async () => null }));
  let sequence = 0;
  t.mock.method(SequenceCounter, "findOneAndUpdate", async () => ({ value: ++sequence }));
  const insert = t.mock.method(Property, "insertMany", async documents => documents.map(d => new Property(d)));
  const res = response();
  await generateProjectProperties(req({ phases: [{ phaseNumber: 2, blocks: [{ blockNumber: 1, lotCount: 2, areasSqm: [120, 100.5], pricesPerSqm: [2500, 1000] }] }] }), res, next);
  assert.equal(res.code, 201);
  assert.deepEqual(insert.mock.calls[0].arguments[0].map(p => p.pricePerSqm), [2500, 1000]);
  assert.deepEqual(res.body.data.map(p => p.toJSON().pricePerLot), [300000, 100500]);
});


test("renumbering to an unused lot keeps identity, phase and block unchanged", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "countDocuments", async () => 1);
  t.mock.method(Property, "find", () => ({ lean: async () => [{ _id: ids[0], phaseNumber: 1, blockNumber: 3, lotNumber: 7 }] }));
  t.mock.method(Property, "exists", async filter => {
    assert.equal(filter.project, projectId);
    assert.deepEqual(filter.$or[0], { phaseNumber: 1, blockNumber: 3, lotNumber: 12, _id: { $ne: ids[0] } });
    return null;
  });
  const write = t.mock.method(Property, "bulkWrite", async () => ({ matchedCount: 1 }));
  const res = response();
  await updateProjectProperties(req({ updates: [{ _id: ids[0], lotNumber: 12, areaSqm: 120, status: "FOR_ASSUME" }] }), res, next);
  assert.equal(res.code, 200);
  const operation = write.mock.calls[0].arguments[0][0].updateOne;
  assert.equal(operation.filter._id, ids[0]);
  assert.equal(operation.update.$set.lotNumber, 12);assert.equal(operation.update.$set.status, "FOR_ASSUME");
  for (const immutable of ["propertyId", "phaseNumber", "blockNumber", "client"]) assert.equal(Object.hasOwn(operation.update.$set, immutable), false);
});

test("duplicate and invalid lot numbers are blocked before batch updates", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "countDocuments", async () => 1);
  t.mock.method(Property, "find", () => ({ lean: async () => [{ _id: ids[0], phaseNumber: 1, blockNumber: 1, lotNumber: 1 }] }));
  t.mock.method(Property, "exists", async () => ({ _id: ids[1] }));
  const write = t.mock.method(Property, "bulkWrite", async () => { throw Error("Must not update"); });
  for (const number of [0, -1, 1.5, "2", 2]) {
    const res = response();
    await updateProjectProperties(req({ updates: [{ _id: ids[0], lotNumber: number, areaSqm: 120, status: "AVAILABLE" }] }), res, next);
    assert.equal(res.code, number === 2 ? 409 : 400);
  }
  assert.equal(write.mock.callCount(), 0);
});

test("custom starting lot numbers and For Assume are persisted when generating", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "findOne", () => ({ lean: async () => null }));
  let n = 0; t.mock.method(SequenceCounter, "findOneAndUpdate", async () => ({ value: ++n }));
  const insert = t.mock.method(Property, "insertMany", async docs => docs);
  const res = response();
  await generateProjectProperties(req({ phases: [{ phaseNumber: 1, blocks: [{ blockNumber: 1, startLotNumber: 15, lotCount: 2, statuses: ["FOR_ASSUME", "AVAILABLE"] }] }] }), res, next);
  assert.equal(res.code, 201);
  assert.deepEqual(insert.mock.calls[0].arguments[0].map(p => [p.lotNumber, p.status]), [[15, "FOR_ASSUME"], [16, "AVAILABLE"]]);
});

test("unique-index race returns a recoverable duplicate response", async t => {
  t.mock.method(Project, "findById", async () => ({ _id: projectId, status: "ACTIVE" }));
  t.mock.method(Property, "countDocuments", async () => 1);
  t.mock.method(Property, "find", () => ({ lean: async () => [{ _id: ids[0], phaseNumber: 1, blockNumber: 1, lotNumber: 1 }] }));
  t.mock.method(Property, "exists", async () => null);
  t.mock.method(Property, "bulkWrite", async () => { throw { code: 11000 }; });
  const res = response();
  await updateProjectProperties(req({ updates: [{ _id: ids[0], lotNumber: 2, status: "AVAILABLE" }] }), res, next);
  assert.equal(res.code, 409); assert.match(res.body.message, /refresh inventory/);
});

test('a supplier/landowner payout reference protects an otherwise available lot',async t=>{t.mock.method(Project,'findById',async()=>({_id:projectId,status:'ACTIVE'}));t.mock.method(Property,'find',()=>({lean:async()=>ids.map(_id=>({_id,status:'AVAILABLE',client:null}))}));t.mock.method(OfficePayout,'exists',async()=>({_id:'linked-payout'}));t.mock.method(Property,'deleteMany',async()=>{throw Error('Protected lot must not be deleted')});const res=response();await deleteLots(req({ids}),res,next);assert.equal(res.code,409)});
