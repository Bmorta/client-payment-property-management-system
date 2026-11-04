import mongoose from "mongoose";
const { Schema } = mongoose;
const paymentSchema = new Schema({
  paymentId: { type: String, required: true }, requestId: { type: String, required: true },
  amountCents: { type: Number, required: true, min: 1 }, paymentDate: { type: String, required: true },
  method: { type: String, required: true }, reference: { type: String, default: "" }, notes: { type: String, default: "" },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, createdAt: { type: Date, default: Date.now }
});
// Contract, schedule and immutable payment ledger share a document so recording
// a payment and checking its balance remain atomic on local standalone MongoDB.
const assignmentSchema = new Schema({
  assignmentId: { type: String, unique: true, required: true },
  client: { type: Schema.Types.ObjectId, ref: "Client", required: true },
  project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  property: { type: Schema.Types.ObjectId, ref: "Property", unique: true, required: true },
  contract: {
    totalCents: { type: Number, required: true, min: 1 }, months: { type: Number, enum: [12,24,36,48,60], required: true },
    areaSqm: Number, pricePerSqm: Number, contractDate: { type: String, required: true }, firstDueDate: { type: String, required: true },
    downPaymentCents: { type: Number, default: 0 },
    schedule: [{ _id: false, installment: Number, dueDate: String, amountCents: Number }]
  },
  payments: { type: [paymentSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
assignmentSchema.index({ client: 1, createdAt: -1 });
export default mongoose.model("PropertyAssignment", assignmentSchema);
