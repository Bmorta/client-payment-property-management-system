import {createHash} from 'node:crypto';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {loadFinancialData} from '../services/financialReportService.js';
import {cashCorrectionPlan} from '../services/cashReconciliation.js';
import {cashMutation,validateCashTimeline} from '../services/cashMovementService.js';
import {reviewActor} from '../utils/auditValues.js';
import {today,validDate,moneyCents} from '../utils/accounting.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail=(message,statusCode=409)=>{throw Object.assign(new Error(message),{statusCode})};
function values(req){const amountCents=moneyCents(req.body.amount),effectiveDate=req.body.effectiveDate,reason=String(req.body.reason||'').trim();if(!Number.isSafeInteger(amountCents)||amountCents<0||!validDate(effectiveDate)||effectiveDate>today()||reason.length<10||reason.length>500||req.body.coverageConfirmed!==true)fail('Enter the verified amount/date, evidence reason (10–500 characters), and confirm original records were checked.',400);return {amountCents,effectiveDate,reason};}
async function inspect(req,session=null){const entry=await CashLedgerEntry.findOne({entryId:req.params.entryId}).session(session).lean();if(!entry)fail('Cash entry not found.',404);const v=values(req),data=await loadFinancialData(today(),session),plan=cashCorrectionPlan(data,entry,{amountCents:v.amountCents,effectiveDate:v.effectiveDate},today()),token=hash({entry,data,values:v});return {entry,v,plan,token};}
export async function previewCashReconciliationCorrection(req,res,next){try{const {plan,token}=await inspect(req);res.json({success:true,data:{...plan,token}})}catch(e){next(e)}}
export async function applyCashReconciliationCorrection(req,res,next){try{
 if(req.body.confirm!==true||!/^[A-Za-z0-9_-]{16,100}$/.test(req.body.requestId||''))fail('Confirm the reviewed correction with a valid submission identity.',400);
 const v=values(req),signature=hash(v);const result=await cashMutation(async session=>{
 const current=await CashLedgerEntry.findOne({entryId:req.params.entryId}).session(session).lean();if(!current)fail('Cash entry not found.',404);
 const previous=current.history?.find(h=>h.action==='CASH_RECONCILIATION_CORRECTION'&&h.requestId===req.body.requestId);if(previous){if(previous.signature!==signature)fail('Submission identity was reused for different correction details.');return current;}
 const {entry,plan,token}=await inspect(req,session);if(req.body.previewToken!==token||(entry.__v??0)!==req.body.expectedVersion)fail('Cash source records changed. Generate and approve a fresh correction preview.');if(!plan.allowed)fail('Correction does not reconcile the complete ledger: '+plan.reasons.join(' '));
 const event={action:'CASH_RECONCILIATION_CORRECTION',requestId:req.body.requestId,signature,...reviewActor(req.user),timestamp:new Date(),reason:v.reason,previousValues:plan.before,updatedValues:plan.after};
 const result=await CashLedgerEntry.collection.updateOne({_id:entry._id,__v:entry.__v===undefined?{$exists:false}:entry.__v,status:'POSTED'},{$set:{...plan.after,updatedAt:new Date()},$push:{history:event},$inc:{__v:1}},{session});if(result.modifiedCount!==1)fail('Cash entry changed during approval. No partial correction was applied.');await validateCashTimeline(session);return CashLedgerEntry.findById(entry._id).session(session).lean();
 });res.json({success:true,data:result,message:'Approved correction applied to the identified cash entry. Original values and evidence reason remain in history.'});
 }catch(e){next(e)}}
