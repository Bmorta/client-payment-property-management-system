import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {normalizeMigrationRow,possibleDuplicate,assertVersion,migrationStats,migrationContext} from '../src/utils/migrationRules.js';
import {materialize} from '../src/services/migrationService.js';
import {validateWorkbookArchive} from '../src/controllers/migrationImportController.js';
import {calculateLedger} from '../src/utils/contractMonitoring.js';
import {financialRows,filterPayments,cashPosition} from '../src/utils/financialReporting.js';
import {buildSchedule} from '../src/utils/accounting.js';
const terms={dueDay:5,graceDays:5,penaltyRateBps:300,penaltyStatus:'ACTIVE',penaltyBasis:'UNPAID_BALANCE',effectiveDate:'2022-01-01',forfeitureMonths:3,criticalMonths:2,reminderDays:3,allocationPriority:'PRINCIPAL_FIRST'};
const account={_id:'test',assignmentId:'CTR-TEST',contract:{totalCents:7200000,downPaymentCents:0,months:12,contractDate:'2022-01-01',firstDueDate:'2022-02-05',monitoringTerms:terms,schedule:buildSchedule(7200000,12,'2022-02-05',0,'2022-01-01')},payments:[]};
const row=extra=>normalizeMigrationRow({kind:'PAYMENT',date:'2022-02-05',receiptNumber:'000123',series:'series a',type:'INSTALLMENT',method:'CASH',amount:'15000',...extra},'2022-10-31',account);
test('historical validation preserves receipt text, dates, centavos and original series',()=>{
 const r=row();assert.equal(r.receiptNumber,'000123');assert.equal(r.series,'SERIES A');assert.equal(r.amountCents,1500000);assert.equal(r.date,'2022-02-05');
 for(const extra of [{date:'2022-11-01'},{date:'2021-01-01'},{amount:'1.123'},{amount:'-1'},{receiptNumber:''},{type:'AUTO'},{method:'OTHER'}])assert.throws(()=>row(extra));
 assert.equal(possibleDuplicate(r,{...r,series:'series a'}),'RECEIPT_SERIES');assert.equal(possibleDuplicate(r,{...r,series:'SERIES B'}),'DATE_AMOUNT');
});
test('staged history does not mutate source and allocations cover two full months plus partial third',()=>{
 const b={batchId:'MIG-T',cutoffDate:'2022-10-31',reconciliation:{historicalStatus:'ACTIVE'},rows:[{...row(),rowId:'r1',encodedAt:'2026-11-07T10:00:00Z',encodedBy:'staff'}]};
 const {proposed,payments}=materialize(account,b);assert.equal(account.payments.length,0);assert.equal(payments[0].paymentDate,'2022-02-05');assert.equal(payments[0].origin,'HISTORICAL');assert.equal(payments[0].createdAt,'2026-11-07T10:00:00Z');
 const at=calculateLedger(proposed,payments,'2022-02-05');assert.equal(at.schedule[0].paidCents,600000);assert.equal(at.schedule[1].paidCents,600000);assert.equal(at.schedule[2].paidCents,300000);assert.equal(at.schedule[2].balanceCents,300000);assert.equal(at.schedule[1].status,'PAID_IN_ADVANCE');assert.equal(at.assessments.length,0);assert.equal(at.consecutiveUnpaidMonths,0);
 const cutoff=calculateLedger(proposed,payments,'2022-10-31');assert.equal(cutoff.assessments.length,0,'no invented retroactive penalties');
});
test('documented assessments and waivers remain separate from computed post-cutoff penalties',()=>{
 const {proposed}=materialize(account,{batchId:'B',cutoffDate:'2022-10-31',reconciliation:{historicalStatus:'ACTIVE'},rows:[{kind:'PENALTY_ASSESSMENT',rowId:'a',installment:1,date:'2022-02-11',amountCents:18000},{kind:'PENALTY_WAIVER',rowId:'w',assessmentId:'HPA-a',date:'2022-03-01',amountCents:8000}]});
 const ledger=calculateLedger(proposed,[],'2022-10-31');assert.equal(ledger.assessments.length,1);assert.equal(ledger.outstandingPenaltyCents,10000);assert.equal(ledger.assessments[0].assessmentId,'HPA-a');
 const next=calculateLedger(proposed,[],'2022-11-11');assert.ok(next.assessments.length>1);assert.equal(new Set(next.assessments.map(x=>x.assessmentId)).size,next.assessments.length);
});
test('original reporting periods and physical cash are independent from encoding timestamps',()=>{
 const payments=[{paymentId:'HIS-1',origin:'HISTORICAL',receiptNumber:'1',amountCents:600000,paymentDate:'2022-02-05',method:'CASH',createdAt:'2026-11-07'},{paymentId:'PAY-2',origin:'LIVE',amountCents:100000,paymentDate:'2026-11-07',method:'CASH'}];
 const data=financialRows([{_id:'a',migration:{cutoffDate:'2026-10-31'},payments}],[]);
 assert.equal(filterPayments(data.collections,{from:'2026-11-07',to:'2026-11-07'}).length,1);assert.equal(filterPayments(data.collections,{origin:'HISTORICAL'})[0].paymentDate,'2022-02-05');
 const c=cashPosition(data,[{kind:'OPENING',effectiveDate:'2026-11-01',amountCents:500000,status:'POSTED'}],'2026-11-07','2026-11-07');assert.equal(c.closingCents,600000);assert.equal(c.available,true);
 assert.equal(cashPosition(data,[{kind:'OPENING',effectiveDate:'2022-01-01',amountCents:0,status:'POSTED'}],'2026-11-07','2026-11-07').available,false);
});
test('completed staging is immutable and dashboard completion requires activation',()=>{
 assert.throws(()=>assertVersion({__v:1,status:'COMPLETED'},1));assert.throws(()=>assertVersion({__v:2,status:'IN_PROGRESS'},1));
 const stats=migrationStats([{status:'VERIFIED',rows:[{kind:'PAYMENT',amountCents:600000}]},{status:'COMPLETED',rows:[]}],4);assert.equal(stats.counts.NOT_STARTED,2);assert.equal(stats.completionPercent,25);assert.equal(stats.paymentCount,1);
});
test('workbook preflight accepts actual xlsx and rejects malformed/oversized/legacy input',async()=>{
 const book=new ExcelJS.Workbook();book.addWorksheet('Records').addRow(['Contract']);const bytes=Buffer.from(await book.xlsx.writeBuffer());assert.doesNotThrow(()=>validateWorkbookArchive(bytes));
 assert.throws(()=>validateWorkbookArchive(Buffer.from('not excel')));assert.throws(()=>validateWorkbookArchive(Buffer.alloc(5*1024*1024)));const broken=Buffer.from(bytes);broken.writeUInt32LE(0,0);assert.throws(()=>validateWorkbookArchive(broken));
});

test('documented closed accounts preserve outstanding history without false collection or forfeiture alerts',()=>{
 const {proposed}=materialize(account,{batchId:'closed',cutoffDate:'2022-10-31',reconciliation:{historicalStatus:'FORFEITED'},rows:[]});
 const ledger=calculateLedger(proposed,[],'2023-01-01');assert.equal(ledger.balanceCents,7200000);assert.equal(ledger.category,'HISTORICAL_FORFEITED');assert.equal(ledger.schedule.some(s=>s.overdue),false);assert.equal(ledger.nextUnpaidDueDate,null);assert.equal(ledger.consecutiveUnpaidMonths,0);assert.equal(ledger.assessments.length,0);
});
test('other documented historical charges cannot reduce principal or earn commissions',()=>{
 const p={paymentId:'other',type:'OTHER',amountCents:10000,paymentDate:'2022-02-05'};const ledger=calculateLedger(account,[p],'2022-02-05');assert.equal(ledger.principalPaidCents,0);assert.equal(ledger.allocations.other[0].allocationType,'OTHER_CHARGE');assert.equal(ledger.balanceCents,7200000);
});

test('historical down payments reduce the original scheduled DP once and stay out of monthly advance counts',()=>{
 const original={...account,contract:{...account.contract,downPaymentCents:1200000,schedule:buildSchedule(7200000,12,'2022-02-05',1200000,'2022-01-01')}};
 const rows=[{kind:'PAYMENT',rowId:'dp',date:'2022-01-01',amountCents:1200000,type:'DOWN_PAYMENT',method:'CASH',receiptNumber:'DP-1',series:'2022',encodedBy:'staff'},{kind:'PAYMENT',rowId:'mi',date:'2022-02-05',amountCents:1500000,type:'INSTALLMENT',method:'CASH',receiptNumber:'MI-1',series:'2022',encodedBy:'staff'}];
 const {proposed,payments}=materialize(original,{batchId:'DP',cutoffDate:'2022-10-31',reconciliation:{historicalStatus:'ACTIVE'},rows});const ledger=calculateLedger(proposed,payments,'2022-02-05');assert.equal(ledger.balanceCents,4500000);assert.equal(ledger.schedule[0].paidCents,1200000);assert.equal(ledger.allocations['HIS-dp'][0].allocationType,'DOWN_PAYMENT');assert.equal(ledger.advanceCoveredMonths,2);assert.equal(ledger.allocations['HIS-dp'].length,1);
});

test('preparation permits valid past dates without inventing an official cutoff and retains date validation',()=>{
 const input={kind:'PAYMENT',date:'2022-02-05',receiptNumber:'000PREP',series:'2022',type:'INSTALLMENT',method:'CASH',amount:6000};
 assert.equal(normalizeMigrationRow(input,null,account).date,'2022-02-05');
 assert.throws(()=>normalizeMigrationRow({...input,date:'2999-01-01'},null,account));
 assert.throws(()=>normalizeMigrationRow({...input,date:'2021-12-31'},null,account));
 assert.throws(()=>normalizeMigrationRow(input,'2022-02-01',account));
 const draft={cutoffDate:null,review:{preparationMode:true,cutoffDate:null}};
 assert.equal(migrationContext(draft,null).preparationMode,true);assert.equal(draft.cutoffDate,null);
 const configured=migrationContext(draft,{cutoffDate:'2026-10-31'});assert.equal(configured.cutoffDate,'2026-10-31');assert.equal(configured.cutoffDateSnapshot,null);assert.equal(configured.review.preparationMode,true);
 assert.equal(migrationContext({cutoffDate:'2026-09-30'},{cutoffDate:'2026-10-31'}).cutoffDate,'2026-09-30');
});

test('historical supporting references and remarks are optional while financial links, dates and receipts remain validated',()=>{
 const other=row({type:'OTHER',documentReference:'',reference:'',remarks:''});assert.equal(other.documentReference,'');assert.equal(other.reference,'');
 const charge=normalizeMigrationRow({kind:'PENALTY_ASSESSMENT',date:'2022-03-11',amount:180,installment:2},'2022-10-31',account);assert.equal(charge.remarks,'');assert.equal(charge.documentReference,'');
 const waiver=normalizeMigrationRow({kind:'PENALTY_WAIVER',date:'2022-03-12',amount:80,installment:2,assessmentId:'HPA-ORIGINAL'},'2022-10-31',account);assert.equal(waiver.assessmentId,'HPA-ORIGINAL');
 assert.throws(()=>normalizeMigrationRow({...waiver,amount:80,assessmentId:''},'2022-10-31',account),/assessment ID/);
 const payout=normalizeMigrationRow({kind:'COMMISSION',date:'2022-02-05',releaseDate:'2022-02-06',amount:200,earned:600,commissionId:'COM-ORIGINAL',method:'CASH'},'2022-10-31',account);assert.equal(payout.documentReference,'');
 assert.throws(()=>normalizeMigrationRow({...payout,amount:200,earned:600,releaseDate:''},'2022-10-31',account),/release date/);
 assert.throws(()=>row({receiptNumber:''}),/receipt/i);assert.throws(()=>row({amount:-1}));
});
