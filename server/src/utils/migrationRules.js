import {createHash} from 'node:crypto';
import {moneyCents,validDate,today,METHODS} from './accounting.js';
import {validateReceipt,receiptScope} from '../services/receiptService.js';
export const KINDS=['PAYMENT','PENALTY_ASSESSMENT','PENALTY_WAIVER','COMMISSION','CLIENT','CONTRACT'];
export const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
export const hash=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const clean=(v,max=500)=>{if(v!=null&&typeof v!=='string')fail('Invalid text field.');return (v||'').trim().slice(0,max)};
export function normalizeMigrationRow(input,cutoff,account){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('Invalid historical row.');
 const kind=input.kind||'PAYMENT';if(!KINDS.includes(kind))fail('Choose a supported historical record type.');
 const row={kind,date:clean(input.date,10),receiptNumber:clean(input.receiptNumber,120),series:(clean(input.series,120)||receiptScope()).toUpperCase(),type:clean(input.type,30)||'INSTALLMENT',method:clean(input.method,30),fundingAccount:input.fundingAccount||null,reference:clean(input.reference,120),remarks:clean(input.remarks),sourceDocumentType:clean(input.sourceDocumentType,80),documentReference:clean(input.documentReference,160),installment:Number(input.installment||0),commissionId:clean(input.commissionId,160),releaseDate:clean(input.releaseDate,10),contractReference:clean(input.contractReference,120)||account?.assignmentId||'',sourceValues:input.sourceValues||null};
 if(['CLIENT','CONTRACT'].includes(kind)){if(!row.sourceValues||typeof row.sourceValues!=='object')fail('Client/contract source information is required.');row.amountCents=0;}
 else {
  if(!validDate(row.date)||(cutoff&&row.date>cutoff)||row.date>today())fail('Original date must be on or before today and, when configured, the migration cutoff.');
  if(account&&row.date<account.contract.contractDate)fail('Original date precedes the linked contract. Correct the contract through its existing audited workflow.');
  row.amountCents=moneyCents(input.amount);if(!Number.isSafeInteger(row.amountCents)||row.amountCents<0||row.amountCents===0&&kind!=='COMMISSION')fail('Enter a positive historical amount.');
 }
 if(kind==='PAYMENT'){
  validateReceipt(row.receiptNumber);validateReceipt(row.series);
  if(!['DOWN_PAYMENT','INSTALLMENT','PENALTY','OTHER'].includes(row.type)||!METHODS.includes(row.method))fail('Select the original payment type and method.');
  if(row.method==='OTHER'&&!['CASH','NONCASH'].includes(row.fundingAccount))fail('Classify Other payment funding as CASH or NONCASH.');
 }
 if(kind.startsWith('PENALTY_')){if(!Number.isSafeInteger(row.installment)||row.installment<1||account&&!account.contract.schedule.some(s=>s.installment===row.installment))fail('Select a valid installment for the historical penalty.');row.assessmentId=clean(input.assessmentId,160);if(kind==='PENALTY_WAIVER'&&!row.assessmentId)fail('A waiver must reference a documented assessment ID.');}
 if(kind==='COMMISSION'){
  row.earnedCents=moneyCents(input.earned||0);if(!row.commissionId||!Number.isSafeInteger(row.earnedCents)||row.earnedCents<0)fail('Provide the actual commission record ID and documented earned amount.');
  if(row.amountCents>0&&(!validDate(row.releaseDate)||(cutoff&&row.releaseDate>cutoff)||row.releaseDate>today()||row.releaseDate<row.date||!METHODS.includes(row.method)))fail('Released commissions require their original release date and payment method.');
  if(row.method==='OTHER'&&row.amountCents>0&&!['CASH','NONCASH'].includes(row.fundingAccount))fail('Classify Other commission payout funding.');
 }
 row.fingerprint=hash({kind,date:row.date,series:row.series.toUpperCase(),receipt:row.receiptNumber.toUpperCase(),amount:row.amountCents,type:row.type,reference:row.reference.toUpperCase(),commissionId:row.commissionId,document:row.documentReference,source:row.sourceValues});return row;
}
export function possibleDuplicate(a,b){
 if(a.kind!=='PAYMENT'||b.kind&&b.kind!=='PAYMENT')return null;
 const sameReceipt=a.receiptNumber.toUpperCase()===String(b.receiptNumber||'').toUpperCase()&&a.series.toUpperCase()===String(b.series||b.receiptScope||receiptScope()).toUpperCase();
 if(sameReceipt)return 'RECEIPT_SERIES';
 if(a.date===(b.date||b.paymentDate)&&a.amountCents===b.amountCents)return 'DATE_AMOUNT';
 if(a.reference&&a.reference.toUpperCase()===String(b.reference||'').toUpperCase())return 'REFERENCE';
 return null;
}
export function assertVersion(batch,value){if(!Number.isSafeInteger(value)||value!==batch.__v)fail('This migration changed. Refresh before saving.',409);if(batch.status==='COMPLETED')fail('Activated history cannot be edited or deleted. Use the existing administrator correction workflow.',409);}
export function migrationStats(batches,totalAccounts){const counts=Object.fromEntries(['NOT_STARTED','IN_PROGRESS','PENDING_VERIFICATION','VERIFIED','COMPLETED','NEEDS_CORRECTION'].map(s=>[s,0]));let paymentCount=0,amountCents=0;for(const b of batches){counts[b.status]++;for(const r of b.rows||[])if(r.kind==='PAYMENT'&&!r.excluded){paymentCount++;amountCents+=r.amountCents}}counts.NOT_STARTED+=Math.max(0,totalAccounts-batches.length);if(!Number.isSafeInteger(amountCents))fail('Migration totals exceed centavo precision.',409);return {totalAccounts,counts,paymentCount,amountCents,completionPercent:totalAccounts?Math.round(counts.COMPLETED/totalAccounts*100):0};}

// A batch begun during preparation adopts the first official cutoff for review,
// without rewriting its immutable original snapshot or authorizing activation.
export function migrationContext(batch,config){
 const cutoffDate=batch.activation?.cutoffDate||batch.cutoffDate||config?.cutoffDate||null;
 return {...batch,cutoffDateSnapshot:batch.cutoffDate||null,cutoffDate,preparationMode:batch.status==='COMPLETED'?false:!validDate(config?.cutoffDate)};
}
