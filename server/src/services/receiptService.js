import {createHash} from 'node:crypto';
import ReceiptClaim from '../models/ReceiptClaim.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
const fail=(statusCode,message)=>{throw Object.assign(new Error(message),{statusCode})};
export const receiptScope=()=>process.env.RECEIPT_SCOPE||'OFFICE';
export function validateReceipt(value){
 if(typeof value!=='string'||!value.length||value.length>120||value!==value.trim()||!/[A-Za-z0-9]/.test(value)||/[^A-Za-z0-9 /_.-]/.test(value))fail(400,'Enter the issued receipt number (1–120 letters, digits, spaces or / _ . -). Leading zeros are preserved; remove outer spaces.');
 return value;
}
const receiptKey=(scope,number)=>createHash('sha256').update(JSON.stringify([scope,number.toUpperCase()])).digest('hex');
export async function checkReceipt(number,scope,accountId,paymentId,requestId,claim=false,allowSubmissionRetry=false,session=null){
 validateReceipt(number);
 // Check original and historical corrected numbers too; legacy receipts are
 // assigned to the default issuing scope without modifying their stored values.
 const inSession=q=>session?q.session(session):q;
 const accounts=await inSession(PropertyAssignment.find({$or:[{'payments.receiptNumber':new RegExp('^'+number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i')},{'payments.revisions.values.receiptNumber':new RegExp('^'+number.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i')}]}).select('payments')).lean();
 let ownPaymentRequest;
 for(const a of accounts)for(const p of a.payments||[]){if((p.receiptScope||receiptScope())!==scope)continue;if(String(a._id)===String(accountId)&&p.paymentId===paymentId)ownPaymentRequest=p.requestId;if([p.receiptNumber,...(p.revisions||[]).map(r=>r.values?.receiptNumber)].some(n=>n?.toUpperCase()===number.toUpperCase())&&!(String(a._id)===String(accountId)&&(p.paymentId===paymentId||(allowSubmissionRetry&&p.requestId===requestId))))fail(409,'Receipt number already used in this issuing office/series. Check the original transaction.');}
 const key=receiptKey(scope,number);let owner;
 if(claim){try{owner=await inSession(ReceiptClaim.findOneAndUpdate({_id:key},{$setOnInsert:{scope,receiptNumber:number,accountId,paymentId,requestId}},{upsert:true,new:true,session:session||undefined})).lean()}catch(e){if(e.code!==11000)throw e;owner=await inSession(ReceiptClaim.findById(key)).lean()}}
 else owner=await inSession(ReceiptClaim.findById(key)).lean();
 if(owner&&!(String(owner.accountId)===String(accountId)&&(owner.paymentId===paymentId||owner.requestId===requestId||(ownPaymentRequest&&owner.requestId===ownPaymentRequest))))fail(409,'Receipt number is already reserved or recorded in this issuing office/series. Check payment history before retrying.');
}
