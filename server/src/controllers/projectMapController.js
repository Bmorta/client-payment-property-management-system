import mongoose from 'mongoose';
import Project from '../models/Project.js';
import ProjectMap from '../models/ProjectMap.js';
const fail=(statusCode,message)=>{throw Object.assign(new Error(message),{statusCode})};
export function decodeMapUpload(body){
 if(!body||typeof body.dataBase64!=='string'||body.dataBase64.length>5600000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.dataBase64))fail(400,'Upload a valid PNG or JPEG image up to 4 MB.');
 const data=Buffer.from(body.dataBase64,'base64');if(!data.length||data.length>4*1024*1024||data.toString('base64')!==body.dataBase64)fail(400,'Upload a valid image up to 4 MB.');
 let contentType,width,height;
 if(data.length>=45&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&data.toString('ascii',12,16)==='IHDR'&&data.toString('ascii',data.length-8,data.length-4)==='IEND'){contentType='image/png';width=data.readUInt32BE(16);height=data.readUInt32BE(20)}
 else if(data.length>10&&data[0]===255&&data[1]===216&&data.at(-2)===255&&data.at(-1)===217){
  let o=2;while(o+4<data.length){if(data[o++]!==255)break;while(data[o]===255)o++;const marker=data[o++];if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=215)continue;const length=data.readUInt16BE(o);if(length<2||o+length>data.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8){height=data.readUInt16BE(o+3);width=data.readUInt16BE(o+5);contentType='image/jpeg';break}o+=length}
 }
 if(!contentType||!width||!height||width>16000||height>16000||width*height>40000000)fail(400,'Use a PNG or JPEG map with at most 40 million pixels and 16,000 pixels per side.');
 if(!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<0)fail(400,'Refresh the map before uploading.');
 const filename=String(body.filename||'property-map').replace(/[\x00-\x1f\\/]/g,'').slice(0,160);
 return {data,filename,contentType,size:data.length,width,height};
}
export function prepareMapUpload(req,res,next){try{req.mapUpload=decodeMapUpload(req.body);req.body={expectedVersion:req.body.expectedVersion,...Object.fromEntries(['filename','contentType','size','width','height'].map(k=>[k,req.mapUpload[k]]))};next()}catch(e){next(e)}}
async function project(req){if(!mongoose.isValidObjectId(req.params.projectId))fail(400,'Invalid project ID.');const p=await Project.findById(req.params.projectId).lean();if(!p)fail(404,'Project not found.');return p}
export async function mapInfo(req,res,next){try{await project(req);const map=await ProjectMap.findOne({project:req.params.projectId}).select('-history').lean();res.json({success:true,data:map||null})}catch(e){next(e)}}
export async function getMap(req,res,next){try{await project(req);const map=await ProjectMap.findOne({project:req.params.projectId,deleted:{$ne:true}}).select('+data').lean();if(!map)fail(404,'No map uploaded.');res.set('Cache-Control','private, no-store');res.set('X-Content-Type-Options','nosniff');res.type(map.contentType).send(Buffer.from(Buffer.isBuffer(map.data)?map.data:map.data.buffer))}catch(e){next(e)}}
export async function saveMap(req,res,next){try{
 await ProjectMap.init();const p=await project(req);if(p.status==='ARCHIVED')fail(409,'Archived project maps are read-only.');const expected=req.body.expectedVersion,actor={userId:req.user._id,username:req.user.username,timestamp:new Date()};
 const map=await ProjectMap.findOneAndUpdate({project:p._id,version:expected},{$set:{...req.mapUpload,deleted:false,uploadedBy:req.user._id},$inc:{version:1},$push:{history:{...req.body,...actor,action:expected?'MAP_REPLACED':'MAP_UPLOADED'}}},{upsert:expected===0,new:true,runValidators:true}).select('-history').lean();
 if(!map)fail(409,'Map changed. Refresh before uploading again.');res.json({success:true,data:map,message:'Project map saved. Viewing and zooming never change the uploaded image.'});
 }catch(e){if(e.code===11000)return res.status(409).json({success:false,message:'Map changed. Refresh before uploading again.'});next(e)}}

export async function deleteMap(req,res,next){try{const p=await project(req);if(p.status==='ARCHIVED')fail(409,'Archived project maps are read-only.');if(req.body.confirm!==true||!Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion<1)fail(400,'Confirm deletion and provide the current map version.');const map=await ProjectMap.findOneAndUpdate({project:p._id,version:req.body.expectedVersion,deleted:{$ne:true}},{$unset:{data:1},$set:{deleted:true},$inc:{version:1},$push:{history:{action:'MAP_DELETED',expectedVersion:req.body.expectedVersion,userId:req.user._id,username:req.user.username,timestamp:new Date()}}},{new:true}).select('-history').lean();if(!map)fail(409,'Map changed or was already deleted. Refresh before retrying.');res.json({success:true,data:map,message:'Project map deleted. The project and all lots are unchanged.'})}catch(e){next(e)}}
