import {databaseReadinessFail} from './backupRequirement.js';
import mongoose from 'mongoose';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import AdministrationGuard from '../models/AdministrationGuard.js';
import {loadFinancialData} from './financialReportService.js';
import {cashPosition,fail,formatCash,officeOpeningBaseline} from '../utils/financialReporting.js';
import {today} from '../utils/accounting.js';

// A shared write guard prevents simultaneous cash movements spending the same balance.
export async function supportsCashTransactions(){const hello=await mongoose.connection.db.admin().command({hello:1});return !!hello.setName||hello.msg==='isdbgrid'}
export async function cashMutation(work){
 if(!await supportsCashTransactions())databaseReadinessFail('Cash movements, refund releases and protected corrections require MongoDB transaction support (replica set). Open Database & Backups for readiness details. No changes were applied.');
 await CashLedgerEntry.init();await AdministrationGuard.updateOne({_id:'office-cash'},{$setOnInsert:{revision:0}},{upsert:true});
 const session=await mongoose.startSession();let result;
 try{await session.withTransaction(async()=>{await AdministrationGuard.updateOne({_id:'office-cash'},{$inc:{revision:1}},{session});result=await work(session)});return result}finally{await session.endSession()}
}
export function cashTimelineError(cash,{releaseDate,amountCents}={}){
 const first=cash.firstNegative,href='/reports?view=cash&focus=movements&cashTab=reconciliation'+(releaseDate||first?.date?'&reconcileDate='+(releaseDate||first.date):'')+(amountCents?'&payoutAmount='+amountCents/100:'');
 const day=releaseDate&&cash.timeline?.findLast(d=>d.date<=releaseDate),projected=releaseDate?(day?.closingCents??null):cash.computedClosingCents,available=Number.isSafeInteger(projected)&&Number.isSafeInteger(amountCents)?projected+amountCents:null;
 const message=first?`Cash cannot support this change: the ledger shows a negative daily balance on ${first.date} (${formatCash(first.closingCents)}). ${releaseDate?`Release date: ${releaseDate}. `:''}${available!==null?`Calculated cash before this payout on that date (unverified): ${formatCash(available)}. Required payout: ${formatCash(amountCents)}. Projected closing: ${formatCash(projected)}. `:''}Review entries: ${first.entries.map(e=>e.reference||e.entryId).slice(0,5).join(', ')||'opening baseline'}. Open Cash Ledger Reconciliation.`:'Cash cannot support this change: '+cash.reasons.join(' ');
 return Object.assign(new Error(message),{statusCode:409,cashReconciliation:{href,negativeDate:first?.date||null,releaseDate:releaseDate||null,availableCents:available,requiredCents:amountCents??null,projectedCents:projected,sourceReferences:first?.entries.map(e=>e.reference||e.entryId)||[],reasons:cash.reasons}});
}
export async function validateCashTimeline(session,context={}){
 const data=await loadFinancialData(today(),session),anchor=officeOpeningBaseline(data.entries,today());
 if(!anchor)fail('Record the initial opening cash baseline first. It may be ₱0.00.',409);
 if(context.releaseDate&&context.releaseDate<anchor.effectiveDate)fail('Cash release dates cannot precede the verified opening baseline. Review the original records through Cash Ledger Reconciliation.',409);
 const cash=cashPosition(data,data.entries,anchor.effectiveDate,today());
 if(!cash.available)throw cashTimelineError(cash,context);
 return cash;
}
