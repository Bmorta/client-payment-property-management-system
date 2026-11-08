import mongoose from 'mongoose';
const schema=new mongoose.Schema({_id:String,account:{type:mongoose.Schema.Types.ObjectId,required:true},installmentId:{type:String,required:true},cycleDate:{type:String,required:true},penaltyType:{type:String,default:'MONTHLY'},assessmentId:{type:String,required:true}},{timestamps:true});
schema.index({account:1,installmentId:1,cycleDate:1,penaltyType:1},{unique:true});
export default mongoose.model('PenaltyCycleIdentity',schema);
