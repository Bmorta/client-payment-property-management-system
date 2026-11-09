import {databaseReadinessFail} from './backupRequirement.js';
import mongoose from 'mongoose';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import AdministrationGuard from '../models/AdministrationGuard.js';
import {loadFinancialData} from './financialReportService.js';
import {cashPosition,fail} from '../utils/financialReporting.js';
import {today} from '../utils/accounting.js';

// A shared write guard prevents simultaneous cash movements spending the same balance.
export async function supportsCashTransactions(){const hello=await mongoose.connection.db.admin().command({hello:1});return !!hello.setName||hello.msg==='isdbgrid'}
export async function cashMutation(work){
 if(!await supportsCashTransactions())databaseReadinessFail('Cash movements, refund releases and protected corrections require MongoDB transaction support (replica set). Open Database & Backups for readiness details. No changes were applied.');
 await CashLedgerEntry.init();await AdministrationGuard.updateOne({_id:'office-cash'},{$setOnInsert:{revision:0}},{upsert:true});
 const session=await mongoose.startSession();let result;
 try{await session.withTransaction(async()=>{await AdministrationGuard.updateOne({_id:'office-cash'},{$inc:{revision:1}},{session});result=await work(session)});return result}finally{await session.endSession()}
}
export async function validateCashTimeline(session){
 const data=await loadFinancialData(today(),session),anchor=data.entries.find(e=>e.kind==='OPENING'&&e.status==='POSTED');
 if(!anchor)fail('Record the initial opening cash baseline first. It may be ₱0.00.',409);
 if(data.entries.some(e=>e.status==='POSTED'&&e.kind!=='OPENING'&&e.effectiveDate<anchor.effectiveDate))fail('A cash movement precedes the opening baseline. Review its date.',409);
 const cash=cashPosition(data,data.entries,anchor.effectiveDate,today());
 if(!cash.available)fail('Cash cannot support this change: '+cash.reasons.join(' '),409);
 return cash;
}
