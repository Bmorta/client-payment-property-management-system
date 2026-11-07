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
export async function listCashEntries(req,res,next){try{res.json({success:true,data:await CashLedgerEntry.find().sort({effectiveDate:-1,entryId:-1}).limit(200).lean()})}catch(e){next(e)}}
export async function createCashEntry(req,res,next){try{
 const {kind,effectiveDate,requestId}=req.body,amountCents=moneyCents(req.body.amount),reason=String(req.body.reason||'').trim(),reference=String(req.body.reference||'').trim().slice(0,160);
 if(!['OPENING','INFLOW','OUTFLOW','BANK_DEPOSIT','BANK_WITHDRAWAL'].includes(kind)||!validDate(effectiveDate)||effectiveDate>today()||(!amountCents&&kind!=='OPENING')||reason.length<5||reason.length>500||req.body.confirm!==true||req.body.coverageConfirmed!==true||typeof requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))fail('Confirm a valid amount/date, reason, and cash-ledger coverage. Only an opening balance may be zero.');
 const input={kind,effectiveDate,amountCents,reason,reference},old=await CashLedgerEntry.findOne({requestId}).lean();if(old){if(Object.entries(input).some(([k,v])=>old[k]!==v))fail('Submission ID belongs to another cash entry.',409);return res.json({success:true,data:old,message:'Cash entry already recorded.'})}
 await CashLedgerEntry.init();const entry=await CashLedgerEntry.create({...input,entryId:await generateRecordId('cashEntry'),requestId,createdBy:req.user._id,actorUsername:req.user.username,history:[{action:'CREATED',username:req.user.username,reason,timestamp:new Date()}]});
 await logActivity({req,action:'CASH_ENTRY_RECORDED',entityType:'CashLedgerEntry',entityId:String(entry._id),metadata:input});res.status(201).json({success:true,data:entry,message:'Cash entry recorded. Collections, expenses and commissions were not duplicated.'});
}catch(e){if(e.code===11000)return res.status(409).json({success:false,message:'An active opening balance or this submission already exists. Review the ledger; do not post twice.'});next(e)}}
export async function voidCashEntry(req,res,next){try{
 if(!mongoose.isValidObjectId(req.params.id))fail('Invalid cash entry.');const reason=String(req.body.reason||'').trim();if(req.body.confirm!==true||reason.length<5||reason.length>500)fail('Confirm the void and give a reason.');
 const old=await CashLedgerEntry.findById(req.params.id).lean();if(!old)fail('Cash entry not found.',404);if(old.status==='VOIDED')return res.json({success:true,message:'Cash entry already voided.'});if(!Number.isSafeInteger(req.body.expectedVersion)||req.body.expectedVersion!==(old.__v??0))fail('Cash entry changed. Reload before voiding.',409);
 const entry=await CashLedgerEntry.findOneAndUpdate({_id:old._id,__v:req.body.expectedVersion,status:'POSTED'},{$set:{status:'VOIDED'},$push:{history:{action:'VOIDED',username:req.user.username,reason,timestamp:new Date()}},$inc:{__v:1}},{new:true});if(!entry)fail('Cash entry changed. Reload first.',409);
 await logActivity({req,action:'CASH_ENTRY_VOIDED',entityType:'CashLedgerEntry',entityId:String(old._id),metadata:{previousValues:old,reason}});res.json({success:true,message:'Cash entry voided; original values preserved.'});
}catch(e){next(e)}}
