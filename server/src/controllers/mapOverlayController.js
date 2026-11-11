import {randomUUID} from "node:crypto";
import MapOverlayVersion from "../models/MapOverlayVersion.js";
import Project from '../models/Project.js';
import ProjectMap from '../models/ProjectMap.js';
import Property from '../models/Property.js';
import MapOverlay from '../models/MapOverlay.js';
import {validateOverlay,resolveLinkedStickers} from '../../../shared/mapOverlay.js';
const fail=(m,code=409)=>{throw Object.assign(new Error(m),{statusCode:code})};
export async function mapOverlay(req,res,next){try{
 const p=await Project.findById(req.params.projectId).lean(),map=await ProjectMap.findOne({project:req.params.projectId,deleted:{$ne:true}}).select('version').lean();if(!p||!map)fail('Upload a map first.',404);
 const overlay=await MapOverlay.findOne({project:p._id}).lean();const properties=await Property.find({project:p._id}).select('propertyId phaseNumber blockNumber lotNumber status').lean();
 if(req.method==='GET'){const same=overlay?.mapVersion===map.version;return res.json({success:true,data:{version:overlay?.version||0,mapVersion:map.version,shapes:same?resolveLinkedStickers(overlay.shapes,properties):[],imageChanged:!!overlay&&!same,history:(overlay?.history||[]).map(({shapes,...h})=>h),properties}})}
 if(p.status==='ARCHIVED')fail('Archived project maps are read-only.');if(req.body.confirm!==true||req.body.mapVersion!==map.version||!Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion!==(overlay?.version||0))fail('Map or overlays changed. Refresh before saving.');
 const prior=req.body.restoreVersion==null?null:overlay?.history.find(h=>h.version===req.body.restoreVersion&&h.mapVersion===map.version);if(req.body.restoreVersion!=null&&!prior)fail('The requested annotation version is not available for this map image.');
 const previousVersion=prior?.versionId?await MapOverlayVersion.findById(prior.versionId).lean():null;if(prior?.versionId&&(!previousVersion||String(previousVersion.project)!==String(p._id)))fail('The saved annotation evidence is unavailable. No overlay was changed.');
 const shapes=validateOverlay(prior?(previousVersion?.event?.shapes||prior.shapes):req.body.shapes);for(const shape of shapes)if(shape.linkedPropertyId&&!properties.some(p=>String(p._id)===shape.linkedPropertyId))fail('A linked lot does not belong to this project.');
 const event={version:(overlay?.version||0)+1,mapVersion:map.version,shapes,action:prior?'OVERLAY_RESTORED':'OVERLAY_SAVED',restoredFrom:prior?.version,userId:req.user._id,username:req.user.username,timestamp:new Date()};
 const versionId=randomUUID();await MapOverlayVersion.create({_id:versionId,project:p._id,event});const {shapes:archivedShapes,...metadata}=event;
 await MapOverlay.init();const saved=await MapOverlay.findOneAndUpdate({_id:overlay?._id||p._id,project:p._id,version:overlay?.version||0},{$set:{mapVersion:map.version,shapes},$inc:{version:1},$push:{history:{...metadata,versionId}}},{upsert:!overlay,new:true,runValidators:true}).lean();if(!saved)fail('Annotations changed. Refresh before saving.');
 res.json({success:true,data:{...saved,shapes:resolveLinkedStickers(saved.shapes,properties)},message:prior?'Previous annotations restored as a new version.':'Map annotations saved. Inventory and original image are unchanged.'});
 }catch(e){if(e.code===11000)return next(Object.assign(new Error('Annotations changed. Refresh before saving.'),{statusCode:409}));next(e)}}
