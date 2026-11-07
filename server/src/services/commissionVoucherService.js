import {createHash} from 'node:crypto';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import Voucher from '../models/CommissionVoucher.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import {effectivePayout} from '../utils/commissionLedger.js';
export const voucherFail=(message,code=409)=>{throw Object.assign(new Error(message),{statusCode:code})};
export const voucherActor=req=>({userId:String(req.user._id),username:req.user.username,role:req.user.role,timestamp:new Date()});
export const entryPaid=(a,voucherId,entryId,exclude='')=>(a.commissionPayouts||[]).filter(p=>String(p.voucherId)===String(voucherId)&&p.voucherEntryId===entryId&&p.payoutId!==exclude).map(effectivePayout).reduce((n,p)=>n+p.amountCents,0);
export async function lockVoucher(req,a,record,amountCents){
 if(!req.body.voucherId){if(req.body.voucherEntryId)voucherFail('Select a valid voucher.',400);return null}
 if(typeof req.body.voucherId!=='string'||!mongoose.isValidObjectId(req.body.voucherId))voucherFail('Invalid voucher identifier.',400);
 const v=await Voucher.findById(req.body.voucherId).lean();if(!v||v.approvalState!=='APPROVED')voucherFail('Voucher must be approved before payout.');
 const e=v.entries.find(e=>e.entryId===req.body.voucherEntryId&&e.accountId===String(a._id)&&e.commissionId===record.commissionId&&v.agent===record.agent);
 if(!e||req.body.method!==v.method||amountCents>e.amountCents-entryPaid(a,v._id,e.entryId))voucherFail('Payout exceeds this voucher entry or its payout method differs.');
 const intent={token:randomUUID(),requestId:req.body.requestId,entryId:e.entryId,accountId:String(a._id),accountVersion:a.__v,actor:voucherActor(req)};
 const saved=await Voucher.findOneAndUpdate({_id:v._id,__v:v.__v,approvalState:'APPROVED',paymentIntent:null},{$set:{paymentIntent:intent},$inc:{__v:1}}).lean();if(!saved)voucherFail('Voucher changed or a payout is being processed. Reload it.');
 return {voucherId:String(v._id),voucherEntryId:e.entryId,voucherOperationId:intent.token};
}
export async function finalizeVoucher(payout){if(!payout.voucherId)return;await Voucher.updateOne({_id:payout.voucherId,'paymentIntent.token':payout.voucherOperationId},{$set:{paymentIntent:null},$push:{history:{action:'PAYOUT_RECORDED',payoutId:payout.payoutId,amountCents:payout.amountCents,username:payout.username,timestamp:new Date()}},$inc:{__v:1}})}
export async function validateVoucherCorrection(a,payout,values){if(!payout.voucherId||values.voided)return;if(values.amountCents>effectivePayout(payout).amountCents)voucherFail('Record any additional voucher payout as a new authorized transaction; linked payout corrections may only reduce or void the amount.');const v=await Voucher.findById(payout.voucherId).lean(),e=v?.entries.find(e=>e.entryId===payout.voucherEntryId);if(!e||values.method!==v.method||values.amountCents>e.amountCents-entryPaid(a,v._id,e.entryId,payout.payoutId))voucherFail('Correction exceeds the linked voucher amount or changes its payout method.');if(v.approvalState==='CANCELLED'&&values.amountCents>effectivePayout(payout).amountCents)voucherFail('A cancelled voucher cannot authorize an increase.');}
export async function voucherView(v){const accounts=await PropertyAssignment.find({_id:{$in:[...new Set(v.entries.map(e=>e.accountId))]}}).lean();const entries=v.entries.map(e=>{const a=accounts.find(a=>String(a._id)===e.accountId);const payouts=(a?.commissionPayouts||[]).filter(p=>String(p.voucherId)===String(v._id)&&p.voucherEntryId===e.entryId).map(effectivePayout);return {...e,paidCents:payouts.reduce((n,p)=>n+p.amountCents,0),payouts}}),paid=entries.reduce((n,e)=>n+e.paidCents,0),total=entries.reduce((n,e)=>n+e.amountCents,0);const printSnapshot=createHash('sha256').update(JSON.stringify({brand:v.brand,approvalState:v.approvalState,method:v.method,voucherDate:v.voucherDate,entries})).digest('hex');return {...v,printSnapshot,entries,totalCents:total,paidCents:paid,status:v.approvalState==='CANCELLED'?'CANCELLED':paid>=total?'PAID':paid>0?'PARTIALLY_PAID':v.approvalState};}
