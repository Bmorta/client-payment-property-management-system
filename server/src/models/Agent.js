import mongoose from "mongoose";
const schema=new mongoose.Schema({
 agentId:{type:String,required:true,unique:true,immutable:true},fullName:{type:String,trim:true,required:true,maxlength:160},contactNumber:{type:String,trim:true,default:""},email:{type:String,trim:true,lowercase:true,default:""},address:{type:String,trim:true,default:""},agentType:{type:String,trim:true,required:true,maxlength:80},status:{type:String,enum:["ACTIVE","INACTIVE"],default:"ACTIVE"},assignedProjects:[{type:mongoose.Schema.Types.ObjectId,ref:"Project"}],createdBy:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},history:{type:[mongoose.Schema.Types.Mixed],default:[]}
},{timestamps:true});
schema.index({fullName:1});
export default mongoose.model("Agent",schema);
