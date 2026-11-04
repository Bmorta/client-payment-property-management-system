import SequenceCounter from "../models/SequenceCounter.js";

const prefixes = Object.freeze({
  project: "PRJ",
  phase: "PHS",
  block: "BLK",
  property: "PROP",
  client: "CLT",
  contract: "CTR",
  payment: "PAY",
  expense: "EXP",
  receipt: "RCP"
});

/**
 * Allocate a unique sequence atomically across concurrent requests.
 * Call only on the server. Never derive IDs from document counts.
 * Existing manually assigned IDs must be reconciled before enabling this
 * generator for a collection containing older records.
 */
export async function generateRecordId(type) {
  const prefix = prefixes[type];
  if (!prefix) throw new Error(`Unknown record ID type: ${type}`);

  const counter = await SequenceCounter.findOneAndUpdate(
    { _id: type },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );

  return `${prefix}-${String(counter.value).padStart(6, "0")}`;
}
