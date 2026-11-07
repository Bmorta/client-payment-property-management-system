import mongoose from 'mongoose';
const schema=new mongoose.Schema({project:{type:mongoose.Schema.Types.ObjectId,ref:'Project',required:true,unique:true},data:{type:Buffer,select:false},deleted:{type:Boolean,default:false},filename:String,contentType:String,size:Number,width:Number,height:Number,version:{type:Number,default:0},uploadedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},history:{type:[mongoose.Schema.Types.Mixed],default:[]}},{timestamps:true});
export default mongoose.model('ProjectMap',schema);
