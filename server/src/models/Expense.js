import mongoose from "mongoose";
const expenseSchema = new mongoose.Schema({
  expenseId: { type: String, required: true, unique: true }, requestId: { type: String, required: true, unique: true },
  category: { type: String, enum: ["OFFICE", "PROJECT", "OTHER"], required: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", default: null },
  expenseDate: { type: String, required: true }, amountCents: { type: Number, min: 1, required: true },
  description: { type: String, required: true }, payee: { type: String, default: "" }, reference: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });
export default mongoose.model("Expense", expenseSchema);
