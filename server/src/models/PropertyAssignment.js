import PenaltyCycleIdentity from "./PenaltyCycleIdentity.js";
import {createHash} from "node:crypto";
import mongoose from "mongoose";
import { validTerm } from "../../../shared/paymentSchedule.js";
const { Schema } = mongoose;
const paymentSchema = new Schema({
  origin:{type:String,enum:["LIVE","HISTORICAL"],default:"LIVE",immutable:true}, migrationBatchId:String, migrationRowId:String,
  fundingAccount:{type:String,enum:["CASH","NONCASH",null],default:null}, receiptScope: String, configuration: Schema.Types.Mixed,
  type: {type:String,enum:["AUTO","DOWN_PAYMENT","INSTALLMENT","PENALTY","OTHER"],default:"AUTO"},
  batchAccountCount:Number,postedAt:Date,paymentIntent:Schema.Types.Mixed,submissionHash:String,batchReference:String,groupRequestId:String,batchAcknowledgment:Schema.Types.Mixed,notesMode:String,monthsToPay:Number,
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
  property: { type: Schema.Types.ObjectId, ref: "Property", required: true },
  lifecycle:{type:String,enum:["ACTIVE","TRANSFERRED","CANCELLATION_PENDING","CANCELLED"],default:"ACTIVE"},
  transferIn:Schema.Types.Mixed,transferOut:Schema.Types.Mixed,cancellationOut:Schema.Types.Mixed,pendingCancellation:Schema.Types.Mixed,creditAmendments:{type:[Schema.Types.Mixed],default:[]},
  contract: {
    transferPricing:Schema.Types.Mixed,
    totalCents: { type: Number, required: true, min: 1 }, months: { type: Number, validate: validTerm, required: true }, termType: { type: String, enum: ["PREDEFINED", "CUSTOM"], default: "PREDEFINED" },
    monitoringTerms: {type:Schema.Types.Mixed,default:null},
    monthlyInstallmentCents:Number,
    areaSqm: Number, pricePerSqm: Number, contractDate: { type: String, required: true }, firstDueDate: { type: String, required: true },
    downPaymentCents: { type: Number, default: 0 },
    schedule: [{ _id: false, installment: Number, dueDate: String, amountCents: Number }]
  },
  paymentPenaltyPolicies:{type:[Schema.Types.Mixed],default:[]},
  commissionAgreement:Schema.Types.Mixed,
  commissionHistoricalReviews:{type:[Schema.Types.Mixed],default:[]},
  commissionAgreementHistory:{type:[Schema.Types.Mixed],default:[]},
  commissionSnapshot:Schema.Types.Mixed,
  commissionEvents:{type:[Schema.Types.Mixed],default:[]},
  commissionPayouts:{type:[Schema.Types.Mixed],default:[]},
  commissionRecoveries:{type:[Schema.Types.Mixed],default:[]},
  migration: Schema.Types.Mixed,
  historicalPenalties:{type:[Schema.Types.Mixed],default:[]},
  monitoring: Schema.Types.Mixed,
  penaltyReconciliation:Schema.Types.Mixed,
  penaltyCalculationRule:{type:String,enum:["LEGACY_RECURRING","CURRENT_OVERDUE"]},
  penaltyRuleUpgrade:Schema.Types.Mixed,
  penaltyRuleHistory:{type:[Schema.Types.Mixed],default:[]},
  penaltySnapshots:{type:[Schema.Types.Mixed],default:[]},
  penaltyRecalculationRuns:{type:[Schema.Types.Mixed],default:[]},
  penaltyWaiverBatches:{type:[Schema.Types.Mixed],default:[]},
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
assignmentSchema.index({property:1},{name:"active_property_contract",unique:true,partialFilterExpression:{lifecycle:"ACTIVE"}});
assignmentSchema.path('commissionSnapshot').validate(value=>!value?.records||new Set(value.records.map(r=>r.commissionId)).size===value.records.length,'Duplicate commission period keys.');
assignmentSchema.index({"commissionSnapshot.records.agent":1,project:1});
assignmentSchema.index({"payments.paymentId":1},{unique:true,partialFilterExpression:{"payments.paymentId":{$type:"string"}}});
assignmentSchema.index({"commissionPayouts.payoutId":1},{unique:true,partialFilterExpression:{"commissionPayouts.payoutId":{$type:"string"}}});
assignmentSchema.index({"correctionRequests.requestNumber":1},{unique:true,partialFilterExpression:{"correctionRequests.requestNumber":{$type:"string"}}});
assignmentSchema.index({ client: 1, createdAt: -1 });
// Application validation plus account-version CAS guards new embedded cycle writes.
// Audit history is append-only and intentionally may mention the same cycle more than once.
assignmentSchema.path('historicalPenalties').validate(function(rows){const omitted=new Set(this.penaltyReconciliation?.excludedIds||[]),indexes=new Set(this.penaltyReconciliation?.excludedIndexes||[]),keys=new Set();return (rows||[]).every((r,i)=>{if(omitted.has(r.assessmentId)||indexes.has(i))return true;const key=`${r.installmentId||'I'+r.installment}:${r.cycleDate}:${r.penaltyType||'MONTHLY'}`;if(keys.has(key))return false;keys.add(key);return true})},'Duplicate historical installment/cycle assessment. Use administrator reconciliation.');

// Registry keys are nonfinancial identities; the account remains the authoritative ledger.
// All financial snapshot writes claim the unique contract/installment/cycle/type key.
assignmentSchema.pre(['updateOne','findOneAndUpdate'],async function(){const rows=this.getUpdate()?.$set?.monitoring?.assessments,account=this.getFilter()?._id;if(!rows||!account||!rows.length)return;const seen=new Set(),session=this.getOptions().session,operations=[];for(const p of rows){const installmentId=p.installmentId||`I${p.installment}`,penaltyType=p.penaltyType||'MONTHLY',key=createHash('sha256').update(JSON.stringify([String(account),installmentId,p.cycleDate,penaltyType])).digest('hex');if(seen.has(key))throw Object.assign(new Error('Duplicate installment/cycle assessment. Use administrator recalculation.'),{statusCode:409});seen.add(key);const values={account,installmentId,cycleDate:p.cycleDate,penaltyType,assessmentId:p.assessmentId};operations.push({updateOne:{filter:{_id:key},update:{$set:values},upsert:true}})}try{await PenaltyCycleIdentity.bulkWrite(operations,{session,ordered:true})}catch(e){if(e.code===11000)throw Object.assign(new Error('This installment/cycle identity changed concurrently. Refresh and review again.'),{statusCode:409});throw e}});

export default mongoose.model("PropertyAssignment", assignmentSchema);
