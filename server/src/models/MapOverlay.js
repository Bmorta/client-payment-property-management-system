import mongoose from 'mongoose';

export function assertOverlayIdentity(filter,options={}){
 if(options.upsert&&(!filter._id||!filter.project||String(filter._id)!==String(filter.project)))throw Object.assign(new Error('New map overlays must use their project ID as the unique overlay ID.'),{statusCode:400});
}
// One overlay per project is enforced by MongoDB's native unique _id index.
// Do not require an extra project index (and populated-database maintenance)
// for the same identity. Previously installed project indexes are preserved.
const schema=new mongoose.Schema({project:{type:mongoose.Schema.Types.ObjectId,ref:'Project',required:true,immutable:true},mapVersion:Number,version:{type:Number,default:0},shapes:{type:[mongoose.Schema.Types.Mixed],default:[]},history:{type:[mongoose.Schema.Types.Mixed],default:[]}},{timestamps:true});
schema.pre('validate',function(){
 if(this.isNew&&this.project){
  if(this.$isDefault('_id'))this._id=this.project;
  else if(String(this._id)!==String(this.project))this.invalidate('_id','New map overlays must use their project ID as the unique overlay ID.');
 }
});
schema.pre('findOneAndUpdate',function(){assertOverlayIdentity(this.getFilter(),this.getOptions())});
export default mongoose.model('MapOverlay',schema);
