import mongoose from 'mongoose';
// Immutable branding references preserve names/logos used by report previews or
// downloads. This records branding use, not proof a paper document was issued.
const schema=new mongoose.Schema({_id:String,company:{type:mongoose.Schema.Types.ObjectId,ref:'Company',required:true,immutable:true},version:{type:Number,required:true,immutable:true},companyName:{type:String,immutable:true},companyLogo:{type:String,immutable:true},companyAddress:{type:String,immutable:true},companyContact:{type:String,immutable:true},capturedAt:{type:Date,default:Date.now,immutable:true}},{versionKey:false});
export default mongoose.model('ReportBrandSnapshot',schema);
