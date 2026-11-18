import mongoose from 'mongoose';

const { Schema } = mongoose;
const schema = new Schema({
  property: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
  project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  client: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  agent: { type: Schema.Types.ObjectId, ref: 'Agent' },
  account: { type: Schema.Types.ObjectId, ref: 'PropertyAssignment' },
  requestId: { type: String, required: true, unique: true },
  held: { type: Boolean, required: true, default: true },
  status: { type: String, enum: ['ACTIVE','EXPIRED','CONVERTED','CANCELLED','RELEASED'], default: 'ACTIVE' },
  startDate: { type: String, immutable: true },
  expiresOn: { type: String, required: true },
  notes: String,
  creditPolicy: { type: String, enum: ['ANY_PRINCIPAL','DOWN_PAYMENT','FIRST_INSTALLMENT'], required: true },
  terms: { type: String, required: true },
  payment: { type: Schema.Types.Mixed, required: true, immutable: true },
  disposition: { type: String, enum: ['OUTSTANDING','APPLIED','RETAINED','REFUNDED'], default: 'OUTSTANDING' },
  refund: Schema.Types.Mixed,
  history: { type: [Schema.Types.Mixed], default: [] }
}, { timestamps: true });
schema.index({ property: 1, held: 1 }, { unique: true, partialFilterExpression: { held: true } });
schema.index({ status: 1, expiresOn: 1 });
export default mongoose.model('Reservation', schema);
