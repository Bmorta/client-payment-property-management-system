import mongoose from 'mongoose';
const schema=new mongoose.Schema({batch:{type:mongoose.Schema.Types.ObjectId,ref:'MigrationBatch',required:true},rowId:String,name:String,mime:String,sha256:String,data:{type:Buffer,select:false},deleted:{type:Boolean,default:false},createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},history:{type:[mongoose.Schema.Types.Mixed],default:[]}},{timestamps:true});
export default mongoose.model('MigrationDocument',schema);
