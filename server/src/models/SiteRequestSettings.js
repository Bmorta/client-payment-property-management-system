import mongoose from 'mongoose';
const schema=new mongoose.Schema({_id:{type:String,default:'OFFICE'},types:{type:[mongoose.Schema.Types.Mixed],default:[]},history:{type:[mongoose.Schema.Types.Mixed],default:[]}},{timestamps:true});
export default mongoose.model('SiteRequestSettings',schema);
