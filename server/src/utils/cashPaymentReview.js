import {physicalFunding} from './fundingAccount.js';
import {cashPosition,officeOpeningBaseline,isPosted} from './financialReporting.js';

export function cashPaymentWarning(entries,date,method,fundingAccount,through){
 if(physicalFunding(method,fundingAccount)!=='CASH')return null;
 const anchor=officeOpeningBaseline(entries,through);
 if(!anchor)return 'Initial cash balance is not confirmed. This payment is recorded as a collection, but available office cash remains unverified.';
 return date<anchor.effectiveDate?`This cash payment predates the opening balance (${anchor.effectiveDate}). It will not increase current Cash on Hand; verify that its date is correct.`:null;
}
const contribution=(p,anchor)=>p&&p.origin!=='HISTORICAL'&&physicalFunding(p.method,p.fundingAccount)==='CASH'&&isPosted(p)&&!p.voided&&p.paymentDate>=anchor.effectiveDate?`${p.paymentDate}:${p.amountCents}`:null;
export function affectsVerifiedCash(before,after,anchor){return !!anchor&&contribution(before,anchor)!==contribution(after,anchor)}
export function projectCashPaymentCorrection(data,before,after,through){
 const anchor=officeOpeningBaseline(data.entries,through);
 const warning=cashPaymentWarning(data.entries,after.paymentDate,after.method,after.fundingAccount,through);
 if(!affectsVerifiedCash(before,after,anchor))return {warning,affected:false};
 const original=cashPosition(data,data.entries,anchor.effectiveDate,through,{includeDaily:false});
 const projectedData={...data,collections:data.collections.map(row=>row.paymentId===before.paymentId?{...row,...after,posted:isPosted(after)&&!after.voided}:row)};
 const projected=cashPosition(projectedData,data.entries,anchor.effectiveDate,through,{includeDaily:false});
 return {warning,affected:true,beforeCents:original.closingCents,afterCents:projected.closingCents,allowed:projected.available,reasons:projected.reasons};
}
