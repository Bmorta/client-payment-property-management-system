import mongoose from 'mongoose';
const schema=new mongoose.Schema({
  caseId:{type:String,required:true,unique:true},requestId:{type:String,required:true,unique:true},
  source:{type:mongoose.Schema.Types.ObjectId,ref:'PropertyAssignment',required:true},property:{type:mongoose.Schema.Types.ObjectId,ref:'Property',required:true},
  previousAssumptionStatus:{type:String,enum:['NONE','ASSUMED'],default:'NONE'},
  targetClient:{type:mongoose.Schema.Types.ObjectId,ref:'Client',default:null},newBuyer:{type:mongoose.Schema.Types.Mixed,default:null},
  input:{type:mongoose.Schema.Types.Mixed,required:true},snapshot:{type:mongoose.Schema.Types.Mixed,required:true},
  status:{type:String,enum:['PENDING','APPROVED','REJECTED','CANCELLED'],default:'PENDING'},successor:{type:mongoose.Schema.Types.ObjectId,ref:'PropertyAssignment',default:null},
  requestedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},requestedAt:{type:Date,default:Date.now},
  decision:mongoose.Schema.Types.Mixed,history:{type:[mongoose.Schema.Types.Mixed],default:[]}
},{timestamps:true});
schema.index({source:1,status:1},{unique:true,partialFilterExpression:{status:'PENDING'},name:'one_pending_assumption_per_source'});
schema.index({property:1,status:1},{unique:true,partialFilterExpression:{status:'PENDING'},name:'one_pending_assumption_per_property'});
export default mongoose.model('AssumptionCase',schema);
