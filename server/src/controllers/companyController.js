import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import Company from '../models/Company.js';
import Project from '../models/Project.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import Expense from '../models/Expense.js';
import ReportBrandSnapshot from '../models/ReportBrandSnapshot.js';
const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
const text=(v,max)=>{if(typeof v!=='string')fail('Invalid company text.');if(v.length>max)fail(`Company text exceeds ${max} characters.`);return v.trim()};
const actor=req=>({username:req.user.username,userId:String(req.user._id),timestamp:new Date()});
async function logo(input){if(input==null)return undefined;if(input.remove===true)return '';if(typeof input.base64!=='string'||input.base64.length>3*1024*1024)fail('Logo must be PNG, JPEG or WebP up to 2 MB.');const bytes=Buffer.from(input.base64,'base64');if(bytes.length>2*1024*1024)fail('Logo exceeds 2 MB.');
 try{const image=sharp(bytes,{limitInputPixels:16000000,animated:false}),meta=await image.metadata();if(!['png','jpeg','webp'].includes(meta.format)||meta.pages>1||!meta.width||!meta.height)fail('Choose a single PNG, JPEG or WebP image.');const normalized=await image.rotate().resize({width:512,height:256,fit:'inside',withoutEnlargement:true}).png().toBuffer();return `data:image/png;base64,${normalized.toString('base64')}`}catch(e){if(e.statusCode)throw e;fail('The logo cannot be decoded safely. Choose a valid PNG, JPEG or WebP image.')}
}
export async function listCompanies(req,res,next){try{const q=String(req.query.q||'').slice(0,100).toLowerCase();if(req.query.direction&&!['asc','desc'].includes(req.query.direction))fail('Invalid sort direction.');let rows=await Company.find({status:{$ne:'DELETED'}}).select('-history').lean();rows=rows.filter(c=>[c.name,c.about,c.companyId].join(' ').toLowerCase().includes(q));rows.sort((a,b)=>a.name.localeCompare(b.name)*(req.query.direction==='desc'?-1:1));res.json({success:true,data:rows})}catch(e){next(e)}}
export async function createCompany(req,res,next){try{const name=text(req.body.name,160),about=text(req.body.about||'',4000);if(!name)fail('Company name is required.');const logoDataUrl=await logo(req.body.logo)||'';const result=await Company.create({companyId:`CMP-${randomUUID()}`,name,about,logoDataUrl,createdBy:req.user._id,history:[{action:'CREATED',...actor(req),updatedValues:{name,about,logoDataUrl}}]});res.status(201).json({success:true,data:result,message:'Company created. No existing records were assigned.'})}catch(e){next(e)}}
export async function updateCompany(req,res,next){try{if(!mongoose.isValidObjectId(req.params.id))fail('Invalid company.');const company=await Company.findById(req.params.id).lean();if(!company||company.status==='DELETED')fail('Company not found.',404);if(!Number.isSafeInteger(req.body.version)||company.__v!==req.body.version)fail('Company changed. Refresh before editing.',409);const reason=text(req.body.reason||'',500);if(!reason)fail('A reason is required.');let set={};const action=req.body.action||'EDIT';
 if(action==='EDIT'){const name=text(req.body.name,160);if(!name)fail('Company name is required.');set={name,about:text(req.body.about||'',4000)};const image=await logo(req.body.logo);if(image!==undefined)set.logoDataUrl=image}
 else if(action==='ARCHIVE'||action==='RESTORE')set.status=action==='ARCHIVE'?'ARCHIVED':'ACTIVE';
 else if(action==='PROJECTS'){
  const ids=req.body.projectIds;if(!Array.isArray(ids)||ids.length>1000||new Set(ids).size!==ids.length||ids.some(i=>typeof i!=='string'||!mongoose.isValidObjectId(i)))fail('Choose unique registered projects.');if(company.status!=='ACTIVE')fail('Restore the company before assigning projects.',409);
  if(await Project.countDocuments({_id:{$in:ids}})!==ids.length)fail('An assigned project no longer exists.');
  const removed=company.projects.filter(p=>!ids.includes(String(p)));
  if(removed.length&&(await PropertyAssignment.exists({project:{$in:removed}})||await Expense.exists({project:{$in:removed}})))fail('Projects with contracts or expenses must retain their company association for historical reporting.',409);
  set.projects=ids;
 }else if(action==='DELETE'){
  if(req.body.confirm!==true)fail('Confirm company deletion.');if(company.projects.length||await ReportBrandSnapshot.exists({company:company._id}))fail('This company has project or reporting references. Archive it instead; financial records will be preserved.',409);
  // Auditable tombstone: no financial records are cascaded or destroyed.
  set={status:'DELETED',logoDataUrl:''};
 }else fail('Invalid company action.');
 const previousValues={name:company.name,about:company.about,logoDataUrl:company.logoDataUrl,status:company.status,projects:company.projects};
 const result=await Company.findOneAndUpdate({_id:company._id,__v:company.__v},{$set:set,$inc:{__v:1},$push:{history:{action,reason,...actor(req),previousValues,updatedValues:set}}},{new:true,runValidators:true}).lean();if(!result)fail('Company changed. Refresh and retry.',409);
 res.json({success:true,data:result,message:action==='DELETE'?'Company removed; audit metadata preserved.':'Company updated.'});
 }catch(e){if(e.code===11000)e=Object.assign(new Error('A selected project already belongs to another company. Refresh assignments.'),{statusCode:409});next(e)}}
