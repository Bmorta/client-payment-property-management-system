import mongoose from "mongoose";
import { validTerm } from "../../../shared/paymentSchedule.js";
const { Schema } = mongoose;
const paymentSchema = new Schema({
  type: {type:String,enum:["AUTO","DOWN_PAYMENT","INSTALLMENT","PENALTY"],default:"AUTO"},
  allocations: {type:[Schema.Types.Mixed],default:[]},
  revisions: {type:[Schema.Types.Mixed],default:[]},
  agreementVersion: { type: Number, default: 1 },
  actorUsername: String, actorRole: String,
  paymentId: { type: String, required: true, immutable: true }, receiptNumber: { type: String, immutable: true }, requestId: { type: String, required: true },
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
    totalCents: { type: Number, required: true, min: 1 }, months: { type: Number, validate: validTerm, required: true }, termType: { type: String, enum: ["PREDEFINED", "CUSTOM"], default: "PREDEFINED" },
    monitoringTerms: {type:Schema.Types.Mixed,default:null},
    monthlyInstallmentCents:Number,
    areaSqm: Number, pricePerSqm: Number, contractDate: { type: String, required: true }, firstDueDate: { type: String, required: true },
    downPaymentCents: { type: Number, default: 0 },
    schedule: [{ _id: false, installment: Number, dueDate: String, amountCents: Number }]
  },
  commissionAgreement:Schema.Types.Mixed,
  commissionAgreementHistory:{type:[Schema.Types.Mixed],default:[]},
  commissionSnapshot:Schema.Types.Mixed,
  commissionEvents:{type:[Schema.Types.Mixed],default:[]},
  commissionPayouts:{type:[Schema.Types.Mixed],default:[]},
  commissionRecoveries:{type:[Schema.Types.Mixed],default:[]},
  monitoring: Schema.Types.Mixed,
  allocationVersions: {type:[Schema.Types.Mixed],default:[]},
  penaltyLedger: {type:[Schema.Types.Mixed],default:[]},
  penaltyWaivers: {type:[Schema.Types.Mixed],default:[]},
  forfeitureReviews: {type:[Schema.Types.Mixed],default:[]},
  correctionRequests: {type:[Schema.Types.Mixed],default:[]},
  notifications: {type:[Schema.Types.Mixed],default:[]},
  agreementHistory: { type: [Schema.Types.Mixed], default: [] },
  auditEvents: { type: [Schema.Types.Mixed], default: [] },
  payments: { type: [paymentSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
assignmentSchema.index({"commissionSnapshot.records.agent":1,project:1});
assignmentSchema.index({ client: 1, createdAt: -1 });
export default mongoose.model("PropertyAssignment", assignmentSchema);
