import mongoose from 'mongoose';
export default mongoose.model('PaymentIntentClaim',new mongoose.Schema({_id:String,submissionHash:{type:String,required:true,immutable:true},client:{type:mongoose.Schema.Types.ObjectId,required:true,immutable:true},accountIds:[String],batchReference:{type:String,immutable:true},paymentIds:{type:[String],immutable:true}},{timestamps:true}));
