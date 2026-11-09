import mongoose from 'mongoose';

// Serializes administrator removals so concurrent transactions cannot both
// observe another administrator and remove the final two administrators.
const schema = new mongoose.Schema({
  _id: String,
  revision: {type: Number, default: 0}
}, {versionKey: false});
export default mongoose.model('AdministrationGuard', schema);
