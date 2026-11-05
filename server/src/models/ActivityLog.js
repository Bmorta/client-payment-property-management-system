import mongoose from "mongoose";

const activityLogSchema = new mongoose.Schema(
  {
    module: { type: String, default: "" },
    username: { type: String, default: "" },
    userRole: { type: String, default: "" },
    description: { type: String, default: "" },
    outcome: { type: String, enum: ["PENDING", "SUCCEEDED", "FAILED"], default: "SUCCEEDED" },
    previousValues: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedValues: { type: mongoose.Schema.Types.Mixed, default: null },
    completedAt: { type: Date, default: null },
    action: {
      type: String,
      required: true,
      trim: true
    },
    entityType: {
      type: String,
      default: null,
      trim: true
    },
    entityId: {
      type: String,
      default: null,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });

export default mongoose.model("ActivityLog", activityLogSchema);
