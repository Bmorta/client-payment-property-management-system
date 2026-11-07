import mongoose from 'mongoose';
const schema=new mongoose.Schema({_id:{type:String,default:'OFFICE'},cutoffDate:{type:String,required:true},stagingStarted:{type:Boolean,default:false},backupReference:String,recoveryTestReference:String,history:{type:[mongoose.Schema.Types.Mixed],default:[]},activationSequence:{type:Number,default:0}},{timestamps:true});
export default mongoose.model('MigrationConfig',schema);
