import mongoose from "mongoose";
import { validPrice, lotPrice } from "../utils/lotPricing.js";

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
    pricePerSqm: { type: Number, default: null, validate: { validator: validPrice, message: "Price per sqm must be non-negative with at most two decimal places." } },
    client: { type: mongoose.Schema.Types.ObjectId, ref: "Client", default: null },
    status: {
      type: String,
      enum: ["AVAILABLE", "RESERVED", "SOLD", "FOR_ASSUME", "UNAVAILABLE"],
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

propertySchema.virtual("pricePerLot").get(function () { return lotPrice(this.areaSqm, this.pricePerSqm); });
propertySchema.virtual("canDelete").get(function () { return this.status === "AVAILABLE" && !this.client; });
propertySchema.set("toJSON", { virtuals: true });

export default mongoose.model("Property", propertySchema);
