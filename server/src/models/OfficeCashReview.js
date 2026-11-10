import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 reviewId:{type:String,required:true,unique:true},requestId:{type:String,required:true,unique:true},type:{type:String,enum:['TURNOVER','COUNT'],required:true},ledger:{type:String,enum:['OFFICE'],default:'OFFICE'},
 date:{type:String,required:true},amountCents:{type:Number,required:true,min:0},recipient:{type:String,default:''},reference:{type:String,default:''},remarks:{type:String,default:''},
 systemCents:Number,differenceCents:Number,systemSnapshot:String,
 status:{type:String,enum:['DRAFT','PENDING_APPROVAL','APPROVED','RELEASED','CANCELLED'],default:'DRAFT'},createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},preparedBy:String,approvedBy:String,releasedBy:String,releasedDate:String,entryId:String,
 history:{type:[mongoose.Schema.Types.Mixed],default:[]}
},{timestamps:true});
schema.index({type:1,date:-1});
export default mongoose.model('OfficeCashReview',schema);
