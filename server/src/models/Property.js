import mongoose from "mongoose";

// One document represents one physical lot in a project.
// Phase and block numbers describe location; propertyId is the immutable ID.
const propertySchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, unique: true, immutable: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    phaseNumber: { type: Number, required: true, min: 1 },
    blockNumber: { type: Number, required: true, min: 1 },
    lotNumber: { type: Number, required: true, min: 1 },
    areaSqm: { type: Number, default: null, min: 0 },
    status: {
      type: String,
      enum: ["AVAILABLE", "RESERVED", "SOLD", "UNAVAILABLE"],
      default: "AVAILABLE"
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

// A phase/block/lot combination must be unique within each project.
// The same phase/block/lot numbers may exist in different projects.
propertySchema.index(
  { project: 1, phaseNumber: 1, blockNumber: 1, lotNumber: 1 },
  { unique: true }
);
propertySchema.index({ project: 1, status: 1 });

export default mongoose.model("Property", propertySchema);
