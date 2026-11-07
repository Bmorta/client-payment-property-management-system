import {PAYMENT_METHODS} from "../../../shared/paymentMethods.js";
import mongoose from "mongoose";
const expenseSchema = new mongoose.Schema({
  expenseId: { type: String, required: true, unique: true }, requestId: { type: String, required: true, unique: true },
  category: { type: String, enum: ["OFFICE", "PROJECT", "OTHER"], required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
  expenseDate: { type: String, required: true }, amountCents: { type: Number, min: 1, required: true },
  fundingAccount:{type:String,enum:["CASH","NONCASH",null],default:null},
  method:{type:String,enum:[...PAYMENT_METHODS,null],default:null}, status:{type:String,enum:["POSTED","VOIDED"],default:"POSTED"},
  commissionPayoutId:{type:String,default:null},payoutLinkChecked:{type:Boolean,default:false},classificationHistory:{type:[mongoose.Schema.Types.Mixed],default:[]},
  description: { type: String, required: true }, payee: { type: String, default: "" }, reference: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
expenseSchema.index({commissionPayoutId:1},{unique:true,partialFilterExpression:{commissionPayoutId:{$type:"string"}}});
export default mongoose.model("Expense", expenseSchema);
