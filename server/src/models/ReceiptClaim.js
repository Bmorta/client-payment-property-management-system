import mongoose from "mongoose";
// Unique scalar key enforces office/series receipt ownership across accounts on
// standalone MongoDB. Claims are retained after voids/corrections for traceability.
const schema=new mongoose.Schema({_id:String,scope:{type:String,required:true},receiptNumber:{type:String,required:true},accountId:{type:mongoose.Schema.Types.ObjectId,required:true},paymentId:{type:String,required:true},requestId:{type:String,required:true}},{timestamps:true});
export default mongoose.model('ReceiptClaim',schema);
