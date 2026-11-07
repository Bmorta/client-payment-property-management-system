import mongoose from 'mongoose';
const S=mongoose.Schema;
const schema=new S({
 batchId:{type:String,unique:true,required:true,immutable:true},account:{type:S.Types.ObjectId,ref:'PropertyAssignment',unique:true,required:true,immutable:true},
 status:{type:String,enum:['NOT_STARTED','IN_PROGRESS','PENDING_VERIFICATION','VERIFIED','COMPLETED','NEEDS_CORRECTION'],default:'NOT_STARTED'},
 cutoffDate:{type:String,required:true,immutable:true},encoder:{type:S.Types.ObjectId,ref:'User'},verifier:{type:S.Types.ObjectId,ref:'User'},
 rows:{type:[S.Types.Mixed],default:[]},imports:{type:[S.Types.Mixed],default:[]},history:{type:[S.Types.Mixed],default:[]},
 reconciliation:{type:S.Types.Mixed,default:{}},review:{type:S.Types.Mixed},activation:{type:S.Types.Mixed},createdBy:{type:S.Types.ObjectId,ref:'User',required:true}
},{timestamps:true,optimisticConcurrency:true});
schema.index({status:1,updatedAt:-1});schema.index({'rows.fingerprint':1});
export default mongoose.model('MigrationBatch',schema);
