import mongoose from "mongoose";

const clientSchema = new mongoose.Schema(
  {
    clientId: { type: String, trim: true, uppercase: true, unique: true, required: true },
    firstName: { type: String, trim: true, required: true },
    middleName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, required: true },
    suffix: { type: String, trim: true, default: "" },
    contactNumber: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    address: { type: String, trim: true, default: "" },
    notes: { type: String, trim: true, default: "" },
    status: { type: String, enum: ["ACTIVE", "INACTIVE"], default: "ACTIVE" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

clientSchema.index({ lastName: 1, firstName: 1 });
clientSchema.index({ email: 1 }, { sparse: true });

clientSchema.virtual("fullName").get(function () {
  return [this.firstName, this.middleName, this.lastName, this.suffix].filter(Boolean).join(" ");
});

clientSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Client", clientSchema);
