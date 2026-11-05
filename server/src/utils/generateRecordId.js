import Agent from "../models/Agent.js";
import Client from "../models/Client.js";
import PropertyAssignment from "../models/PropertyAssignment.js";
import SequenceCounter from "../models/SequenceCounter.js";

const prefixes = Object.freeze({
  agent:"AGT",
  commissionPayout:"CPY",
  project: "PRJ",
  phase: "PHS",
  block: "BLK",
  property: "PROP",
  client: "CL",
  contract: "CTR",
  payment: "PAY",
  expense: "EXP",
  receipt: "RCT"
});

// Reconcile existing numeric IDs before allocating. $max never lowers a counter;
// the subsequent atomic increment is safe across concurrent server processes.
export async function generateRecordId(type) {
  const prefix = prefixes[type];
  if (!prefix) throw new Error(`Unknown record ID type: ${type}`);
  if (["agent", "client", "payment", "receipt", "commissionPayout"].includes(type)) {
    const field = type==="commissionPayout"?"commissionPayouts.payoutId":type==="agent"?"agentId":type === "client" ? "clientId" : `payments.${type === "receipt" ? "receiptNumber" : "paymentId"}`;
    const pattern = type==="commissionPayout"?"^CPY-[0-9]+$":type==="agent"?"^AGT-[0-9]+$":type === "client" ? "^(CL|CLT)-[0-9]+$" : type === "receipt" ? "^(RCT|RCP)-[0-9]+$" : "^PAY-[0-9]+$";
    const model = type==="agent"?Agent:type === "client" ? Client : PropertyAssignment;
    const rows = await model.aggregate([
      ...(["agent","client"].includes(type) ? [] : [{ $unwind: type==="commissionPayout"?"$commissionPayouts":"$payments" }]),
      { $match: { [field]: { $regex: pattern } } },
      { $group: { _id: null, value: { $max: { $convert: { input: { $arrayElemAt: [{ $split: [`$${field}`, "-"] }, -1] }, to: "double", onError: 0, onNull: 0 } } } } }
    ]);
    const value = rows[0]?.value || 0;
    if (!Number.isSafeInteger(value) || value >= Number.MAX_SAFE_INTEGER) throw new Error("Identifier sequence is outside the supported range.");
    try {
      await SequenceCounter.findOneAndUpdate({ _id: type }, { $max: { value } }, { upsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      await SequenceCounter.findOneAndUpdate({ _id: type }, { $max: { value } });
    }
  }
  const counter = await SequenceCounter.findOneAndUpdate(
    { _id: type },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );

  if (!Number.isSafeInteger(counter.value) || counter.value < 1) throw new Error("Identifier sequence is outside the supported range.");
  return `${prefix}-${String(counter.value).padStart(6, "0")}`;
}
