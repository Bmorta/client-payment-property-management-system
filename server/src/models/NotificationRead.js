import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 _id:String,user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 account:{type:mongoose.Schema.Types.ObjectId,ref:'PropertyAssignment',required:true},
 notificationId:{type:String,required:true},readAt:{type:Date,required:true}
},{versionKey:false});
schema.index({user:1,account:1});
export default mongoose.model('NotificationRead',schema);
