import mongoose from 'mongoose';
const schema=new mongoose.Schema({batchReference:{type:String,unique:true,required:true},requestId:{type:String,unique:true,required:true},submissionHash:{type:String,required:true},client:{type:mongoose.Schema.Types.ObjectId,ref:'Client',required:true},paymentDate:String,method:String,totalCents:Number,members:[mongoose.Schema.Types.Mixed],clientSnapshot:mongoose.Schema.Types.Mixed,brand:mongoose.Schema.Types.Mixed,actor:mongoose.Schema.Types.Mixed},{timestamps:true});
export default mongoose.model('PaymentBatch',schema);
