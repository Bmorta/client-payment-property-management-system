import RefundRelease from '../models/RefundRelease.js';
import {cashMutation,validateCashTimeline,supportsCashTransactions} from '../services/cashMovementService.js';
import {escapeSearch} from "../utils/searchText.js";
import {validateFunding,physicalFunding} from "../utils/fundingAccount.js";
import mongoose from 'mongoose';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import Expense from '../models/Expense.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import {effectivePayout} from '../utils/commissionLedger.js';
import {generateRecordId} from '../utils/generateRecordId.js';
import {moneyCents,validDate,today,METHODS} from '../utils/accounting.js';
import {logActivity} from '../utils/activityLogger.js';
import {fail,isPosted} from '../utils/financialReporting.js';
async function cashObligationExists(session=null){return await CashLedgerEntry.exists({kind:'OWNER_TURNOVER',status:'POSTED'}).session(session)||await RefundRelease.exists({status:'POSTED',fundingAccount:'CASH'}).session(session)}
export async function expenseClassification(body){
 if(!METHODS.includes(body.method))fail('Select the actual expense payment method.');
 const fundingAccount=validateFunding(body.method,body.fundingAccount);
 const commissionPayoutId=body.commissionPayoutId?String(body.commissionPayoutId).trim():null;
 if(commissionPayoutId){const account=await PropertyAssignment.findOne({'commissionPayouts.payoutId':commissionPayoutId}).select('commissionPayouts project').lean(),raw=account?.commissionPayouts.find(p=>p.payoutId===commissionPayoutId),p=raw&&effectivePayout(raw);
  if(!p||!isPosted(raw)||p.amountCents<=0||p.amountCents!==body.amountCents||p.releaseDate!==body.expenseDate||p.method!==body.method||physicalFunding(p.method,p.fundingAccount)!==fundingAccount)fail('Linked commission payout must be posted and match this expense amount, date and method.');
  if(body.category==='PROJECT'&&String(account.project)!==String(body.projectId))fail('Linked payout must belong to the selected expense project.');
 }
 return {method:body.method,fundingAccount,commissionPayoutId,payoutLinkChecked:body.payoutLinkChecked===true};
}
export async function classifyExpense(req,res,next){try{
 if(!mongoose.isValidObjectId(req.params.id))fail('Invalid expense.');const old=await Expense.findById(req.params.id).lean();if(!old)fail('Expense not found.',404);
 const reason=String(req.body.reason||'').trim();if(req.body.confirm!==true||reason.length<5||reason.length>500)fail('Confirm the classification and provide a reason (5–500 characters).');
 if(!Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion!==(old.__v??0))fail('Expense changed. Reload before classifying.',409);
 const classification=await expenseClassification({...req.body,amountCents:old.amountCents,expenseDate:old.expenseDate,category:old.category,projectId:old.project});
 const event={previousValues:{fundingAccount:old.fundingAccount||null,method:old.method||null,commissionPayoutId:old.commissionPayoutId||null,payoutLinkChecked:!!old.payoutLinkChecked},updatedValues:classification,reason,username:req.user.username,userId:req.user._id,timestamp:new Date()};
 await Expense.init();
 const updated=await Expense.findOneAndUpdate({_id:old._id,__v:old.__v===undefined?{$exists:false}:old.__v},{$set:classification,$push:{classificationHistory:event},$inc:{__v:1}},{new:true,runValidators:true});if(!updated)fail('Expense changed. Reload before classifying.',409);
 await logActivity({req,action:'EXPENSE_CLASSIFIED',entityType:'Expense',entityId:String(old._id),metadata:event});res.json({success:true,data:updated,message:'Expense classification saved with its history.'});
}catch(e){if(e.code===11000)return res.status(409).json({success:false,message:'This commission payout is already linked to another expense.'});next(e)}}
export async function listCashEntries(req,res,next){try{
 if(req.query?.paged!=='1')return res.json({success:true,data:await CashLedgerEntry.find().sort({effectiveDate:-1,entryId:-1}).limit(200).lean()});
 const page=Number(req.query.page||1),limit=Number(req.query.limit||25),from=req.query.from||'0001-01-01',to=req.query.to||today(),status=req.query.status||'ALL';
 if(!Number.isSafeInteger(page)||page<1||page>100000||![10,25,50,100].includes(limit)||!validDate(from)||!validDate(to)||from>to||!['ALL','POSTED','VOIDED'].includes(status))fail('Choose valid cash-history dates, status and pagination.');
 const filter={effectiveDate:{$gte:from,$lte:to}};if(status==='POSTED')filter.$and=[{$or:[{status:'POSTED'},{status:{$exists:false}}]}];else if(status==='VOIDED')filter.status='VOIDED';
 if(req.query.kind){if(!['OPENING','INFLOW','OUTFLOW','BANK_DEPOSIT','BANK_WITHDRAWAL','OWNER_TURNOVER'].includes(req.query.kind))fail('Invalid cash movement type.');filter.kind=req.query.kind;}
 if(req.query.q){const q=new RegExp(escapeSearch(String(req.query.q).slice(0,100)),'i');filter.$or=['entryId','kind','reason','reference','recipient'].map(k=>({[k]:q}))}
 const [count,rows]=await Promise.all([CashLedgerEntry.countDocuments(filter),CashLedgerEntry.find(filter).sort({effectiveDate:-1,entryId:-1}).skip((page-1)*limit).limit(limit).lean()]);
 res.json({success:true,data:{rows,count,page,pageSize:limit}});
}catch(e){next(e)}}
export async function createCashEntry(req,res,next){try{
 const {kind,effectiveDate,requestId}=req.body,amountCents=moneyCents(req.body.amount),reason=String(req.body.reason||'').trim(),reference=String(req.body.reference||'').trim().slice(0,160);
 if(!['OPENING','INFLOW','OUTFLOW','BANK_DEPOSIT','BANK_WITHDRAWAL','OWNER_TURNOVER'].includes(kind)||!validDate(effectiveDate)||effectiveDate>today()||(!amountCents&&kind!=='OPENING')||(kind!=='OWNER_TURNOVER'&&reason.length<5)||reason.length>500||req.body.confirm!==true||req.body.coverageConfirmed!==true||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))fail('Confirm a valid amount/date, reason, and cash-ledger coverage. Only an opening balance may be zero.');
 const recipient=String(req.body.recipient||'').trim().slice(0,160);if(kind==='OWNER_TURNOVER'&&!recipient)fail('Enter the recipient of the cash turnover.');
 const input={kind,effectiveDate,amountCents,reason,reference,...(recipient?{recipient}:{})},old=await CashLedgerEntry.findOne({requestId}).lean();if(old){if(Object.entries(input).some(([k,v])=>old[k]!==v))fail('Submission ID belongs to another cash entry.',409);return res.json({success:true,data:old,message:'Cash entry already recorded.'})}
 await CashLedgerEntry.init();const entryId=await generateRecordId('cashEntry');
 const make=session=>CashLedgerEntry.create([{...input,entryId,requestId,createdBy:req.user._id,actorUsername:req.user.username,history:[{action:'CREATED',username:req.user.username,reason,timestamp:new Date()}]}],{session});
 const hasTurnovers=kind==='OWNER_TURNOVER'||await cashObligationExists(),protectedLedger=hasTurnovers||await supportsCashTransactions();
 const entry=protectedLedger?await cashMutation(async session=>{const duplicate=await CashLedgerEntry.findOne({requestId}).session(session);if(duplicate){if(Object.entries(input).some(([k,v])=>duplicate[k]!==v))fail('Submission ID belongs to another cash entry.',409);return duplicate}const [row]=await make(session);if(kind==='OWNER_TURNOVER'||await cashObligationExists(session))await validateCashTimeline(session);return row}):(await make(null))[0];
 await logActivity({req,action:'CASH_ENTRY_RECORDED',entityType:'CashLedgerEntry',entityId:String(entry._id),metadata:input});res.status(201).json({success:true,data:entry,message:'Cash entry recorded. Collections, expenses and commissions were not duplicated.'});
}catch(e){if(e.code===11000)return res.status(409).json({success:false,message:'An active opening balance or this submission already exists. Review the ledger; do not post twice.'});next(e)}}
export async function voidCashEntry(req,res,next){try{
 if(!mongoose.isValidObjectId(req.params.id))fail('Invalid cash entry.');const reason=String(req.body.reason||'').trim();if(req.body.confirm!==true||reason.length<5||reason.length>500)fail('Confirm the void and give a reason.');
 const old=await CashLedgerEntry.findById(req.params.id).lean();if(!old)fail('Cash entry not found.',404);if(old.status==='VOIDED')return res.json({success:true,message:'Cash entry already voided.'});if(!Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion!==(old.__v??0))fail('Cash entry changed. Reload before voiding.',409);
 const mutate=async session=>{const entry=await CashLedgerEntry.findOneAndUpdate({_id:old._id,__v:req.body.expectedVersion,status:'POSTED'},{$set:{status:'VOIDED'},$push:{history:{action:'VOIDED',username:req.user.username,reason,timestamp:new Date()}},$inc:{__v:1}},{new:true,session});if(!entry)fail('Cash entry changed. Reload first.',409);if(session&&(old.kind==='OWNER_TURNOVER'||await cashObligationExists(session)))await validateCashTimeline(session);return entry};
 const hasTurnover=await cashObligationExists();const entry=hasTurnover||await supportsCashTransactions()?await cashMutation(mutate):await mutate(null);
 await logActivity({req,action:'CASH_ENTRY_VOIDED',entityType:'CashLedgerEntry',entityId:String(old._id),metadata:{previousValues:old,reason}});res.json({success:true,message:'Cash entry voided; original values preserved.'});
}catch(e){next(e)}}

export async function correctCashTurnover(req,res,next){try{
 if(!mongoose.isValidObjectId(req.params.id))fail('Invalid cash turnover.');
 const effectiveDate=req.body.effectiveDate,amountCents=moneyCents(req.body.amount),recipient=String(req.body.recipient||'').trim(),reference=String(req.body.reference||'').trim(),reason=String(req.body.reason||'').trim(),correctionReason=String(req.body.correctionReason||'').trim();
 if(!amountCents||!validDate(effectiveDate)||effectiveDate>today()||!recipient||recipient.length>160||reference.length>160||reason.length>500||correctionReason.length<5||correctionReason.length>500||req.body.confirm!==true||!Number.isSafeInteger(req.body.expectedVersion))fail('Confirm the correction, valid date, amount, recipient and correction reason (5–500 characters).');
 const updated=await cashMutation(async session=>{
 const old=await CashLedgerEntry.findById(req.params.id).session(session).lean();if(!old||old.kind!=='OWNER_TURNOVER'||old.status!=='POSTED')fail('Select a posted owner turnover.',409);if(old.__v!==req.body.expectedVersion)fail('Turnover changed. Reload before correcting.',409);
 const values={effectiveDate,amountCents,recipient,reference,reason},history={action:'CORRECTED',previousValues:{effectiveDate:old.effectiveDate,amountCents:old.amountCents,recipient:old.recipient,reference:old.reference,reason:old.reason},updatedValues:values,reason:correctionReason,username:req.user.username,userId:req.user._id,timestamp:new Date()};
 // Native update deliberately bypasses immutable input fields only in this audited correction path.
 const result=await CashLedgerEntry.collection.updateOne({_id:old._id,__v:old.__v,status:'POSTED'},{$set:{...values,updatedAt:new Date()},$inc:{__v:1},$push:{history}},{session});if(!result.modifiedCount)fail('Turnover changed. Reload.',409);await validateCashTimeline(session);return CashLedgerEntry.findById(old._id).session(session).lean();
 });await logActivity({req,action:'CASH_TURNOVER_CORRECTED',entityType:'CashLedgerEntry',entityId:String(updated._id),metadata:updated.history.at(-1)});res.json({success:true,data:updated,message:'Turnover corrected. Subsequent cash balances recalculated; history preserved.'});
}catch(e){next(e)}}
