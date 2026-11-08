import {randomUUID} from 'node:crypto';
import {calculateLedger} from '../utils/contractMonitoring.js';
import {effectivePayment} from '../utils/paymentLedger.js';
import {calculateCommissions} from '../utils/commissionLedger.js';
import {normalizeMigrationRow,possibleDuplicate,hash,fail} from '../utils/migrationRules.js';
import {today} from '../utils/accounting.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import MigrationBatch from '../models/MigrationBatch.js';
export const actor=user=>({userId:String(user._id),username:user.username,role:user.role,timestamp:new Date()});
export function materialize(account,batch){
 const proposed=structuredClone(account),rows=batch.rows.filter(r=>!r.excluded),payments=rows.filter(r=>r.kind==='PAYMENT').map(r=>({paymentId:`HIS-${r.rowId}`,requestId:`migration-${r.rowId}`,receiptNumber:r.receiptNumber,receiptScope:r.series,type:r.type,amountCents:r.amountCents,paymentDate:r.date,method:r.method,fundingAccount:r.fundingAccount,reference:r.reference,notes:r.remarks,createdAt:r.encodedAt,postedAt:new Date(),createdBy:r.encodedBy,actorUsername:r.encoderUsername,actorRole:'MIGRATION',origin:'HISTORICAL',migrationBatchId:batch.batchId,migrationRowId:r.rowId,configuration:{allocationPriority:'PRINCIPAL_FIRST'},revisions:[]}));
 const newPayments=payments.filter(p=>!(account.payments||[]).some(old=>old.paymentId===p.paymentId));
 proposed.payments=[...(account.payments||[]),...newPayments];
 proposed.migration={batchId:batch.batchId,cutoffDate:batch.cutoffDate||today(),historicalStatus:batch.reconciliation?.historicalStatus||'ACTIVE',recalculateHistoricalPenalties:batch.simpleApproval===true,activatedAt:new Date()};
 proposed.historicalPenalties=[...(account.historicalPenalties||[]),...rows.filter(r=>r.kind==='PENALTY_ASSESSMENT'&&!(account.historicalPenalties||[]).some(a=>a.assessmentId===`HPA-${r.rowId}`)).map(r=>({assessmentId:`HPA-${r.rowId}`,installmentId:`I${r.installment}`,installment:r.installment,cycleDate:r.date,amountCents:r.amountCents,migrationBatchId:batch.batchId,documentReference:r.documentReference}))];
 proposed.penaltyWaivers=[...(account.penaltyWaivers||[]),...rows.filter(r=>r.kind==='PENALTY_WAIVER'&&!(account.penaltyWaivers||[]).some(w=>w.migrationRowId===r.rowId)).map(r=>({assessmentId:r.assessmentId,amountCents:r.amountCents,effectiveDate:r.date,reason:r.remarks,migrationRowId:r.rowId,migrationBatchId:batch.batchId}))];
 const ledger=calculateLedger(proposed,proposed.payments.map(effectivePayment),today());
 for(const p of payments)p.allocations=ledger.allocations[p.paymentId]||[];
 return {proposed,payments:newPayments,ledger};
}
export async function duplicates(row,accountId,excludeBatchId,session){
 if(row.kind!=='PAYMENT')return [];
 const hits=[];const linked=await PropertyAssignment.findById(accountId).select('client').session(session||null).lean();
 const live=await PropertyAssignment.find({'payments.0':{$exists:true}}).select('payments assignmentId client').session(session||null).lean();
 for(const a of live)for(const raw of a.payments||[]){if(row.rowId&&String(a._id)===String(accountId)&&raw.migrationRowId===row.rowId)continue;const candidates=[raw,...(raw.revisions||[]).map(r=>({...raw,...r.values}))];for(const p of candidates){const kind=possibleDuplicate(row,p);if(kind&&(kind==='RECEIPT_SERIES'||(String(a._id)===String(accountId)||String(a.client)===String(linked?.client)))){hits.push({kind,source:'LIVE',reference:p.paymentId});break}}}
 const staging=await MigrationBatch.find({_id:{$ne:excludeBatchId||null},status:{$ne:'COMPLETED'}}).select('rows account batchId').session(session||null).lean();
 for(const b of staging)for(const r of b.rows||[]){if(r.excluded)continue;const kind=possibleDuplicate(row,r);if(kind&&(kind==='RECEIPT_SERIES'||String(b.account)===String(accountId)))hits.push({kind,source:'STAGING',reference:`${b.batchId}/${r.rowId}`})}
 return hits;
}
export async function validateBatch(batch,account,session){
 const asOf=batch.cutoffDate||today(),preparationMode=batch.preparationMode??!batch.cutoffDate;
 const errors=[],warnings=[],active=batch.rows.filter(r=>!r.excluded),seen=[];
 if(!active.length)errors.push('No historical records to verify.');
 for(const r of active){
  if(r.kind==='PENALTY_ASSESSMENT'&&active.some(other=>other!==r&&other.kind==='PENALTY_ASSESSMENT'&&other.installment===r.installment&&other.date===r.date))errors.push(`${r.rowId}: duplicate installment and penalty cycle. Keep one legitimate assessment.`);
  try {normalizeMigrationRow({...r,amount:r.amountCents/100,earned:(r.earnedCents||0)/100},batch.cutoffDate,account)}catch(e){errors.push(`${r.rowId}: ${e.message}`)}
  const hits=await duplicates(r,account._id,batch._id,session);
  for(const p of seen){const kind=possibleDuplicate(r,p);if(kind)hits.push({kind,source:'BATCH',reference:p.rowId})}seen.push(r);
  const signature=hash(hits.sort((a,b)=>a.reference.localeCompare(b.reference)||a.kind.localeCompare(b.kind)));if(hits.some(h=>h.kind==='RECEIPT_SERIES'))errors.push(`${r.rowId}: receipt and issuing series already used; correct the source/series or exclude this row.`);
  else if(hits.length&&(!r.duplicateReview?.reason||r.duplicateReview.signature!==signature))errors.push(`${r.rowId}: suspected duplicate needs administrator review.`);
  if(r.kind==='CLIENT'&&r.sourceValues?.clientId!==String(account.client?.clientId||''))errors.push(`${r.rowId}: client source does not match the linked registered client.`);
  if(r.kind==='CONTRACT'){
   const source=r.sourceValues||{};
   if(source.contractReference!==account.assignmentId||source.totalCents!==account.contract.totalCents||source.downPaymentCents!==account.contract.downPaymentCents||source.months!==account.contract.months||source.contractDate!==account.contract.contractDate||source.firstDueDate!==account.contract.firstDueDate)errors.push(`${r.rowId}: original contract differs from the linked contract; correct the contract in its existing audited editor before review.`);
  }
 }
 let result;
 try{result=materialize(account,batch)}catch(e){errors.push(`Allocation: ${e.message}`)}
 const recon=batch.reconciliation||{},validStatuses=['ACTIVE','FULLY_PAID','CANCELLED','FORFEITED','TRANSFERRED','UNDER_REVIEW'];
 if(!validStatuses.includes(recon.historicalStatus))errors.push('Documented historical account status is required.');
 if(!Number.isSafeInteger(recon.officeBalanceCents)||recon.officeBalanceCents<0)errors.push('Enter the verified office principal balance.');
 if(!Number.isSafeInteger(recon.officePenaltyCents)||recon.officePenaltyCents<0)errors.push('Enter the verified office penalty balance.');
 if(!recon.documentReference)errors.push('Enter the reconciliation source document reference.');
 if(!recon.expectedPeriods||!Number.isSafeInteger(recon.expectedPeriods)||recon.expectedPeriods<1)errors.push('Enter the number of historical periods checked against printed records.');
 let cutoffLedger,commissions;
 if(result){
  try{
   cutoffLedger=calculateLedger(result.proposed,result.proposed.payments.map(effectivePayment),asOf);
   if(cutoffLedger.balanceCents!==recon.officeBalanceCents)errors.push('Reconstructed principal differs from the verified office balance.');
   if(cutoffLedger.outstandingPenaltyCents!==recon.officePenaltyCents)errors.push('Recorded historical penalties differ from the verified office penalty balance.');
   if(recon.historicalStatus==='FULLY_PAID'&&(cutoffLedger.balanceCents||cutoffLedger.outstandingPenaltyCents))errors.push('Fully Paid status requires zero principal and penalty balances.');
   // Historical earned amounts must match the same production commission rules.
   commissions=calculateCommissions(result.proposed,cutoffLedger,{asOf});
   const docs=active.filter(r=>r.kind==='COMMISSION'),existingPayouts=account.commissionPayouts||[];
   if(account.commissionAgreement){
    if(!batch.simpleApproval&&recon.commissionReview!=='RECONCILED')errors.push('The historical commission agreement requires documented period-by-period reconciliation.');
    for(const c of commissions.records.filter(r=>r.earnedCents>0)){
     const matches=docs.filter(r=>r.commissionId===c.commissionId);
     if(!matches.length&&!batch.simpleApproval)errors.push(`Missing historical commission verification: ${c.commissionId}`);
     if(matches.some(r=>r.earnedCents!==c.earnedCents))errors.push(`Documented earned commission differs: ${c.commissionId}`);
     const released=matches.filter(r=>!existingPayouts.some(p=>p.payoutId===`HCP-${r.rowId}`)).reduce((n,r)=>n+r.amountCents,0)+existingPayouts.filter(p=>p.commissionId===c.commissionId&&!p.revisions?.at(-1)?.values?.voided).reduce((n,p)=>n+p.amountCents,0);
     if(!Number.isSafeInteger(released)||released>c.earnedCents)errors.push(`Historical commission releases exceed earned amount: ${c.commissionId}`);
    }
    for(const d of docs.filter(d=>d.amountCents>0)){
     const atDate=calculateLedger(result.proposed,result.proposed.payments.map(effectivePayment),d.releaseDate);
     const releaseAccount={...result.proposed,commissionPayouts:[...(account.commissionPayouts||[]),...payoutRows(batch,{_id:'migration-review',username:'migration-review'}).filter(p=>!(account.commissionPayouts||[]).some(old=>old.payoutId===p.payoutId))]};
     const record=calculateCommissions(releaseAccount,atDate,{asOf:d.releaseDate}).records.find(r=>r.commissionId===d.commissionId);
     if(!record||record.recoveryDueCents>0)errors.push(`Historical payout was not funded by buyer collections on ${d.releaseDate}: ${d.commissionId}`);
    }
    for(const d of docs){const actual=commissions.records.find(r=>r.commissionId===d.commissionId);if(!actual)errors.push(`Unknown commission agreement period: ${d.commissionId}`);else if(actual.earnedCents!==d.earnedCents)errors.push(`Documented earned commission differs: ${d.commissionId}`);}
   }else if(recon.commissionReview!=='NOT_APPLICABLE'||docs.length)errors.push('No linked commission agreement: explicitly confirm Not Applicable, or configure the original agreement first.');
   const known=new Map(result.proposed.historicalPenalties.map(p=>[p.assessmentId,p]));
   for(const w of active.filter(r=>r.kind==='PENALTY_WAIVER')){const a=known.get(w.assessmentId);if(!a||w.date<a.cycleDate)errors.push(`${w.rowId}: waiver references an unknown or later assessment.`);else if(active.filter(r=>r.kind==='PENALTY_WAIVER'&&r.assessmentId===w.assessmentId).reduce((n,r)=>n+r.amountCents,0)>a.amountCents)errors.push(`${w.rowId}: waivers exceed the original penalty.`)}
  }catch(e){errors.push(e.message)}
 }
 let expectedPenaltyCents=null;
 try{const expected=calculateLedger({...account,migration:null,historicalPenalties:[],penaltyWaivers:(account.penaltyWaivers||[]).filter(w=>!w.migrationBatchId)},[...account.payments.map(effectivePayment),...(result?.payments||[])].filter(p=>p.type!=='PENALTY'),asOf);expectedPenaltyCents=expected.outstandingPenaltyCents}catch(e){warnings.push(`Expected contractual penalty unavailable: ${e.message}`)}
 const total=active.filter(r=>r.kind==='PAYMENT').reduce((n,r)=>n+r.amountCents,0);if(!Number.isSafeInteger(total))errors.push('Historical total exceeds centavo precision.');
 const preview={errors:[...new Set(errors)],warnings,balanced:errors.length===0,cutoffDate:batch.cutoffDate||null,asOf,preparationMode,totalPaymentCents:total,paymentCount:active.filter(r=>r.kind==='PAYMENT').length,
  expectedBalanceCents:cutoffLedger?.balanceCents??null,officeBalanceCents:recon.officeBalanceCents??null,differenceCents:cutoffLedger&&Number.isSafeInteger(recon.officeBalanceCents)?cutoffLedger.balanceCents-recon.officeBalanceCents:null,recordedPenaltyCents:cutoffLedger?.outstandingPenaltyCents??null,expectedPenaltyCents,penaltyDifferenceCents:expectedPenaltyCents!=null&&cutoffLedger?expectedPenaltyCents-cutoffLedger.outstandingPenaltyCents:null,
  nextUnpaidDueDate:cutoffLedger?.nextUnpaidDueDate||null,schedule:cutoffLedger?.schedule||[],allocations:cutoffLedger?.allocations||{},commissions:commissions?.records||[],accountVersion:account.__v??0};
 preview.token=hash({batchVersion:batch.__v,rows:batch.rows,reconciliation:recon,preview});return {preview,result};
}
export function payoutRows(batch,user){return batch.rows.filter(r=>!r.excluded&&r.kind==='COMMISSION'&&r.amountCents>0).map(r=>({payoutId:`HCP-${r.rowId}`,requestId:`migration-${r.rowId}`,commissionId:r.commissionId,amountCents:r.amountCents,releaseDate:r.releaseDate,method:r.method,fundingAccount:r.fundingAccount,reference:r.documentReference,notes:r.remarks,releasedBy:String(user._id),userId:String(user._id),username:user.username,actorUsername:user.username,reason:'Verified historical commission payout',origin:'HISTORICAL',migrationBatchId:batch.batchId,migrationRowId:r.rowId,createdAt:new Date(),revisions:[]}));}
export function newRow(normalized,user,source='MANUAL'){return {...normalized,rowId:randomUUID(),encodedAt:new Date(),encodedBy:String(user._id),encoderUsername:user.username,source};}
