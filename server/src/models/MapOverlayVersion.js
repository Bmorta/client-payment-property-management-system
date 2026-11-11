import mongoose from 'mongoose';
// Immutable overlay versions are written before their reference is committed to
// the current overlay. Failed CAS writes can leave an unreferenced version,
// never a current overlay pointing at missing history or a locked version slot.
export default mongoose.model('MapOverlayVersion',new mongoose.Schema({_id:String,project:{type:mongoose.Schema.Types.ObjectId,ref:'Project',required:true},event:{type:mongoose.Schema.Types.Mixed,required:true}},{timestamps:true}));
