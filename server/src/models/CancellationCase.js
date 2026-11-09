import mongoose from 'mongoose';
const schema=new mongoose.Schema({caseId:{type:String,unique:true,required:true},requestId:{type:String,unique:true,required:true},inputHash:{type:String,required:true},client:{type:mongoose.Schema.Types.ObjectId,ref:'Client',required:true},sourceIds:{type:[mongoose.Schema.Types.ObjectId],required:true},payload:mongoose.Schema.Types.Mixed,snapshot:mongoose.Schema.Types.Mixed,status:{type:String,enum:['APPROVED_PENDING','CANCELLED','SETTLED'],default:'APPROVED_PENDING'},approvedBy:mongoose.Schema.Types.Mixed,finalizedBy:mongoose.Schema.Types.Mixed,finalSnapshot:mongoose.Schema.Types.Mixed,refundPaidCents:{type:Number,default:0},history:{type:[mongoose.Schema.Types.Mixed],default:[]}},{timestamps:true});
schema.index({sourceIds:1},{unique:true});
schema.index({client:1,createdAt:-1});
export default mongoose.model('CancellationCase',schema);
