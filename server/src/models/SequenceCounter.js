import mongoose from "mongoose";

const sequenceCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  value: { type: Number, required: true, default: 0, min: 0 }
}, { versionKey: false });

export default mongoose.model("SequenceCounter", sequenceCounterSchema);
