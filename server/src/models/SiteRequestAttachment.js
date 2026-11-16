import mongoose from 'mongoose';
const schema=new mongoose.Schema({request:{type:mongoose.Schema.Types.ObjectId,ref:'SiteRequest',required:true},name:String,mime:String,data:{type:Buffer,select:false},size:Number,uploadedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},uploadedAt:{type:Date,default:Date.now}},{versionKey:false});
export default mongoose.model('SiteRequestAttachment',schema);
