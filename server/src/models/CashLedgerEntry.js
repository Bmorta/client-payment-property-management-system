import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 entryId:{type:String,required:true,unique:true,immutable:true},requestId:{type:String,required:true,unique:true,immutable:true},
 kind:{type:String,enum:['OPENING','INFLOW','OUTFLOW','BANK_DEPOSIT','BANK_WITHDRAWAL','OWNER_TURNOVER'],required:true,immutable:true},
 effectiveDate:{type:String,required:true,immutable:true},amountCents:{type:Number,min:0,required:true,immutable:true},
 recipient:{type:String,default:'',immutable:true},
 reason:{type:String,required:function(){return this.kind!=='OWNER_TURNOVER'},default:'',immutable:true},reference:{type:String,default:'',immutable:true},
 status:{type:String,enum:['POSTED','VOIDED'],default:'POSTED'},ledger:{type:String,default:'OFFICE',immutable:true},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,immutable:true},actorUsername:String,
 history:{type:[mongoose.Schema.Types.Mixed],default:[]}
},{timestamps:true});
schema.index({ledger:1,kind:1},{unique:true,partialFilterExpression:{kind:'OPENING',status:'POSTED'}});
schema.index({effectiveDate:1,status:1});
export default mongoose.model('CashLedgerEntry',schema);
