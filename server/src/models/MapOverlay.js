import mongoose from 'mongoose';
export default mongoose.model('MapOverlay',new mongoose.Schema({project:{type:mongoose.Schema.Types.ObjectId,ref:'Project',required:true,unique:true},mapVersion:Number,version:{type:Number,default:0},shapes:{type:[mongoose.Schema.Types.Mixed],default:[]},history:{type:[mongoose.Schema.Types.Mixed],default:[]}},{timestamps:true}));
