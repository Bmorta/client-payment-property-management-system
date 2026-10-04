import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    projectId: { type: String, trim: true, uppercase: true, unique: true, required: true },
    projectName: { type: String, trim: true, required: true },
    projectCode: { type: String, trim: true, uppercase: true, unique: true, required: true },
    description: { type: String, trim: true, default: "" },
    location: { type: String, trim: true, default: "" },
    startDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"],
      default: "PLANNING"
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

projectSchema.index({ projectName: 1 });
projectSchema.index({ status: 1 });

export default mongoose.model("Project", projectSchema);
