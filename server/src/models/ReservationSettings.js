import mongoose from 'mongoose';

const schema=new mongoose.Schema({
  _id:String,
  holdDays:{type:Number,required:true,min:1,max:365,validate:Number.isInteger},
  updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true}
},{timestamps:true});
export default mongoose.model('ReservationSettings',schema);
