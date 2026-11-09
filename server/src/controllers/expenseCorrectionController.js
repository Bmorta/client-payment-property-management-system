import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import Project from '../models/Project.js';
import {expenseClassification} from './cashLedgerController.js';
import {moneyCents,today,validDate} from '../utils/accounting.js';
import {intentHash,intentFail as fail} from '../utils/paymentIntent.js';
import {logActivity} from '../utils/activityLogger.js';

const fields=['expenseId','category','project','expenseDate','amountCents','method','fundingAccount','commissionPayoutId','payoutLinkChecked','description','payee','reference','status'];
const snapshot=e=>Object.fromEntries(fields.map(k=>[k,k==='project'?(e.project?._id||e.project||null):e[k]??null]));
const text=(v,max)=>{if(typeof v!=='string'||v.trim().length>max)fail(`Enter text of at most ${max} characters.`);return v.trim();};
const oid=v=>{if(!mongoose.isValidObjectId(v))fail('Invalid expense.');return v;};

export async function expenseDetails(req,res,next){try{
 const e=await Expense.findById(oid(req.params.id)).populate('project','projectName').populate('createdBy','username').lean();if(!e)fail('Expense not found.',404);
 res.json({success:true,data:e});
}catch(e){next(e)}}

export async function correctExpense(req,res,next){try{
 const old=await Expense.findById(oid(req.params.id)).lean();if(!old)fail('Expense not found.',404);
 const {requestId,action,reason:rawReason}=req.body;
 if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId)||!['CORRECT','VOID'].includes(action))fail('Choose a correction or void with a valid submission ID.');
 const reason=text(rawReason||'',500);if(reason.length<5)fail('Enter a correction or void reason of 5–500 characters.');
 const signature=intentHash({action,reason,changes:action==='CORRECT'?req.body.changes:null});
 const previous=old.revisions?.find(r=>r.requestId===requestId);
 if(previous){if(previous.signature!==signature)fail('This submission ID belongs to a different expense correction.',409);return res.json({success:true,data:old,message:'Expense change already recorded. No duplicate applied.'})}
 if((old.status||'POSTED')!=='POSTED')fail('A voided expense cannot be edited or voided again. Its original history is preserved.',409);
 if(!Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion!==(old.__v??0))fail('This expense changed. Reload its history and review a new preview.',409);
 const before=snapshot(old),changes=action==='VOID'?{status:'VOIDED'}:{};
 if(action==='CORRECT'){
  const input=req.body.changes;if(!input||typeof input!=='object'||Array.isArray(input))fail('Enter corrected expense details.');
  const amountCents=moneyCents(input.amount),expenseDate=input.expenseDate,category=input.category,description=text(input.description||'',500);
  if(!amountCents||!description||!validDate(expenseDate)||expenseDate>today()||!['OFFICE','PROJECT','OTHER'].includes(category))fail('Enter a positive amount, valid actual date, category and description.');
  const project=category==='PROJECT'?oid(input.projectId):null;
  if(project&&!await Project.exists({_id:project,...(String(old.project)!==String(project)?{status:{$ne:'ARCHIVED'}}:{})}))fail('Choose an existing project that can accept this expense.');
  const classification=await expenseClassification({...input,amountCents,expenseDate,category,projectId:project,commissionPayoutId:old.commissionPayoutId||null});
  Object.assign(changes,classification,{amountCents,expenseDate,category,description,project,payee:text(input.payee||'',120),reference:text(input.reference||'',120)});
 }
 const after=snapshot({...old,...changes}),token=intentHash({expenseId:String(old._id),version:old.__v??0,requestId,signature,before,after,asOf:today()});
 const warnings=old.commissionPayoutId?['This expense is linked to an agent payout. Changing or voiding this expense does not reverse that payout. Payout history and cash deductions remain independently reconciled.']:[];
 if(req.path.endsWith('/preview'))return res.json({success:true,data:{token,before,after,action,warnings,expectedVersion:old.__v??0}});
 if(req.body.confirm!==true||req.body.previewToken!==token)fail('Review and confirm a fresh expense correction preview.',409);
 const revision={revision:(old.revisions?.length||0)+1,requestId,signature,action,reason,previousValues:before,updatedValues:after,username:req.user.username,userId:req.user._id,timestamp:new Date()};
 const updated=await Expense.findOneAndUpdate({_id:old._id,__v:old.__v===undefined?{$exists:false}:old.__v,'revisions.requestId':{$ne:requestId}},
  {$set:{...changes,...(!old.originalValues?{originalValues:before}:{})},$push:{revisions:revision},$inc:{__v:1}}, {new:true,runValidators:true});
 if(!updated)fail('Expense changed concurrently. Check history before retrying.',409);
 await logActivity({req,action:action==='VOID'?'EXPENSE_VOIDED':'EXPENSE_CORRECTED',entityType:'Expense',entityId:String(old._id),metadata:revision});
 res.json({success:true,data:updated,message:action==='VOID'?'Expense voided. Original details and audit history are preserved.':'Expense corrected. Original details and audit history are preserved.'});
}catch(e){next(e)}}
