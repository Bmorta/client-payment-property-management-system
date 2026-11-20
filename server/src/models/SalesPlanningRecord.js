import mongoose from 'mongoose';

// Independent management metadata; never used by the payment or commission ledger.
const schema=new mongoose.Schema({
 _id:{type:String,required:true},
 kind:{type:String,enum:['TARGET','ATTRIBUTION'],required:true,immutable:true},
 value:{type:mongoose.Schema.Types.Mixed,required:true},
 version:{type:Number,min:1,required:true},
 history:{type:[mongoose.Schema.Types.Mixed],default:[]}
},{timestamps:true});
schema.index({kind:1});
export default mongoose.model('SalesPlanningRecord',schema);
