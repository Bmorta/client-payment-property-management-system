import mongoose from "mongoose";
const schema = new mongoose.Schema({
  blockId: { type: String, required: true, unique: true, immutable: true },
  project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
  phaseNumber: { type: Number, required: true, min: 1 },
  blockNumber: { type: Number, required: true, min: 1 }
}, { timestamps: true });
schema.index({ project: 1, phaseNumber: 1, blockNumber: 1 }, { unique: true });
export default mongoose.model("Block", schema);
