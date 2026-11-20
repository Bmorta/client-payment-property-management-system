import Account from '../models/PropertyAssignment.js';
import Agent from '../models/Agent.js';
import Project from '../models/Project.js';
import SalesPlanningRecord from '../models/SalesPlanningRecord.js';
import {originalSale,recordedSaleAccount} from '../utils/salesClassification.js';
import {salesObjectId,validatedAttribution,validatedTarget} from '../utils/salesPlanningRules.js';

const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
const actor=req=>({userId:String(req.user._id||req.user.id||''),username:req.user.username||'',role:req.user.role});
async function writeRecord(req,key,kind,value){
 const {expectedVersion,reason,confirmed}=req.body;
 if(confirmed!==true||typeof reason!=='string'||reason.trim().length<5||reason.trim().length>500||!Number.isSafeInteger(expectedVersion)||expectedVersion<0)fail('Confirm the change, enter a reason of 5–500 characters, and use the current record version.');
 const previous=await SalesPlanningRecord.findById(key).lean();
 if((previous?.version||0)!==expectedVersion)fail('This sales planning record changed. Refresh and review again.',409);
 const change={version:expectedVersion+1,previous:previous?.value??null,updated:value,reason:reason.trim(),actor:actor(req),timestamp:new Date()};
 if(!previous)try{return await SalesPlanningRecord.create({_id:key,kind,value,version:1,history:[change]})}catch(e){if(e.code===11000)fail('Another administrator saved this record. Refresh and review.',409);throw e}
 const updated=await SalesPlanningRecord.findOneAndUpdate({_id:key,kind,version:expectedVersion},{$set:{value},$inc:{version:1},$push:{history:change}},{new:true,runValidators:true}).lean();
 if(!updated)fail('This sales planning record changed. Refresh and review again.',409);
 return updated;
}
export async function saveSalesTarget(req,res,next){try{
 const {key,value}=validatedTarget(req.body||{});
 if(req.params.key!==key)fail('Target identity does not match the selected calendar scope.');
 if(value.scope==='PROJECT'&&!await Project.exists({_id:value.subject}))fail('Project not found.',404);
 if(value.scope==='AGENT'&&!await Agent.exists({_id:value.subject}))fail('Agent not found.',404);
 const data=await writeRecord(req,key,'TARGET',value);res.json({success:true,data});
}catch(e){next(e)}}
export async function saveSalesAttribution(req,res,next){try{
 const accountId=req.params.id;if(!salesObjectId(accountId))fail('Choose a valid original contract.');
 const a=await Account.findById(accountId).lean();if(!a||!recordedSaleAccount(a)||!originalSale(a))fail('Only a recorded original sales contract can receive formal attribution.',409);
 const shares=validatedAttribution(req.body?.shares),ids=shares.map(s=>s.agentId);
 const agents=await Agent.find({_id:{$in:ids}}).select('_id').lean();if(agents.length!==ids.length)fail('One or more selected agents no longer exist.',409);
 const data=await writeRecord(req,'attribution:'+accountId.toLowerCase(),'ATTRIBUTION',{accountId:accountId.toLowerCase(),shares});res.json({success:true,data});
}catch(e){next(e)}}
