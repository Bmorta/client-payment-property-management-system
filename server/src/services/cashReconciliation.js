import {cashPosition,formatCash,officeOpeningBaseline} from '../utils/financialReporting.js';
import {cashOfficeView} from './cashOfficeView.js';
import {isCashFunded} from '../utils/fundingAccount.js';
// Read-only diagnostics: the same canonical cash ledger feeds dashboard and validation.
export function reconcileCash(data,asOf,through,amountCents=0){
 const anchor=officeOpeningBaseline(data.entries,through),from=anchor?.effectiveDate||asOf;
 const ledger=cashPosition(data,data.entries,from,through),dashboard=cashOfficeView(data,asOf,asOf),dated=cashPosition(data,data.entries,from,asOf),view=cashOfficeView(data,from,through);
 const links=new Map(view.rows.map(r=>[[r.date,r.kind,r.reference,r.entryId||''].join('|'),r.sourceUrl]));
 const days=ledger.timeline.map(d=>({...d,entries:d.entries.map(e=>({...e,href:links.get([e.date,e.kind,e.reference,e.entryId||''].join('|'))||'/reports?view=cash&focus=movements&cashTab=transactions'}))}));
 const inflowsCents=days.reduce((n,d)=>n+d.inflowsCents,0),outflowsCents=days.reduce((n,d)=>n+d.outflowsCents,0),baselineCents=anchor?.amountCents??null;
 const ledgerCashCents=baselineCents===null?null:baselineCents+inflowsCents-outflowsCents,dashboardCashCents=cashPosition(data,data.entries,from,through,{includeDaily:false}).computedClosingCents;
 const projected=amountCents>0?cashPosition(data,[...data.entries,{kind:'OUTFLOW',status:'POSTED',effectiveDate:asOf,amountCents,entryId:'PREVIEW-ONLY',reference:'PROPOSED-PAYOUT'}],from,through):null;
 const earlierDates=[...data.collections.map(r=>r.paymentDate),...data.expenses.map(r=>r.expenseDate),
  ...data.payouts.map(r=>r.date),...data.recoveries.map(r=>r.date),...(data.refunds||[]).map(r=>r.date),...data.entries.map(r=>r.effectiveDate)]
  .filter(date=>date&&date<from).sort();
 const priorTo=new Date(from+'T00:00:00Z');
 priorTo.setUTCDate(priorTo.getUTCDate()-1);
 const prior=anchor&&earlierDates.length?cashOfficeView(data,earlierDates[0],priorTo.toISOString().slice(0,10),{includeDaily:false}):null;
 const historicalRows=anchor?[
  ...data.collections.filter(r=>r.origin==='HISTORICAL'&&r.posted&&isCashFunded(r)&&r.paymentDate<from)
   .map(r=>({date:r.paymentDate,reference:r.paymentId,kind:'HISTORICAL_COLLECTION',amountCents:r.amountCents,sourceUrl:`/payment-transactions?q=${encodeURIComponent(r.paymentId)}`})),
  ...data.payouts.filter(r=>r.origin==='HISTORICAL'&&isCashFunded(r)&&r.date<from)
   .map(r=>({date:r.date,reference:r.payoutId,kind:'HISTORICAL_COMMISSION_PAYOUT',amountCents:-r.amountCents,sourceUrl:`/commissions?account=${encodeURIComponent(r.accountId||'')}`}))
 ]:[];
 const preBaselineRows=[...(prior?.rows||[]),...historicalRows].sort((a,b)=>a.date.localeCompare(b.date)||String(a.reference).localeCompare(String(b.reference)));
 const baselineEvidence=anchor?{entryId:anchor.entryId,effectiveDate:anchor.effectiveDate,amountCents:anchor.amountCents,
  reason:anchor.reason||'',reference:anchor.reference||'',actorUsername:anchor.actorUsername||'',history:anchor.history||[]}:null;
 return {asOf,through,baselineEvidence,preBaselineRows,preBaselinePolicy:"Earlier posted cash records are not replayed into the opening count. Verify that the physical opening count reflects earlier movements; no earlier balance is inferred.",baselineDate:anchor?.effectiveDate||null,baselineEntryId:anchor?.entryId||null,openingBalanceCents:baselineCents,totalInflowsCents:inflowsCents,totalOutflowsCents:outflowsCents,calculatedClosingCents:ledger.computedClosingCents,ledgerCashCents,dashboardCashCents,differenceCents:ledgerCashCents===null||dashboardCashCents===null?null:dashboardCashCents-ledgerCashCents,verified:ledger.available,reasons:ledger.reasons,negativeDays:days.filter(d=>d.closingCents<0),days,periodOpeningCents:dashboard.cash.computedOpeningCents,availableOnDateCents:dated.available?dated.computedClosingCents:null,calculatedOnDateCents:dated.computedClosingCents,payoutPreview:projected?{requiredCents:amountCents,beforeCents:dated.computedClosingCents,remainingOnDateCents:dated.computedClosingCents===null?null:dated.computedClosingCents-amountCents,remainingTodayCents:projected.computedClosingCents,allowed:projected.available,firstNegative:projected.firstNegative,reasons:projected.reasons}:null,explanation:ledger.firstNegative?`The closing total can recover to ${formatCash(ledger.computedClosingCents)}, but ${ledger.firstNegative.date} ended negative. The earlier date must be reconciled before another protected cash change.`:'Dashboard and validation use the same dated, posted cash ledger. A zero difference does not certify missing evidence or authorize a cash adjustment.',correctionGuidance:'Inspect the source links below. Correct a payout through Payout Management; classify or correct an expense through Expenses; correct or void a standalone cash entry through Cash Adjustments; review payment or refund corrections from the original account. Use the existing administrator reason, preview and confirmation. No balancing entry is created here.'};
}

export function cashCorrectionPlan(data,entry,values,through){
 if(entry.status!=='POSTED'||entry.businessPayoutId||entry.payoutReleaseId||!['OPENING','INFLOW','OUTFLOW','OWNER_TURNOVER','BANK_DEPOSIT','BANK_WITHDRAWAL'].includes(entry.kind))throw Object.assign(new Error('Only a posted standalone cash entry may use this correction. Use the original payout workflow for linked financial records.'),{statusCode:409});
 if(entry.kind!=='OPENING'&&values.amountCents===0)throw Object.assign(new Error('A movement must have a positive amount. Use reviewed void for an invalid entry.'),{statusCode:400});
 const before=reconcileCash(data,through,through),proposed={...data,entries:data.entries.map(e=>String(e._id)===String(entry._id)?{...e,...values}:e)},after=reconcileCash(proposed,through,through);
 const coverage=entry.kind==='OPENING'?{
  beforeDate:before.baselineDate,afterDate:after.baselineDate,
  beforeExcluded:before.preBaselineRows.map(row=>({date:row.date,reference:row.reference,kind:row.kind,amountCents:row.amountCents})),
  afterExcluded:after.preBaselineRows.map(row=>({date:row.date,reference:row.reference,kind:row.kind,amountCents:row.amountCents}))
 }:null;
 return {before:{amountCents:entry.amountCents,effectiveDate:entry.effectiveDate},after:values,beforeClosingCents:before.calculatedClosingCents,afterClosingCents:after.calculatedClosingCents,allowed:after.verified,reasons:after.reasons,coverage,negativeDays:after.negativeDays.map(d=>({date:d.date,closingCents:d.closingCents})),affectedFrom:entry.effectiveDate<values.effectiveDate?entry.effectiveDate:values.effectiveDate,expectedVersion:entry.__v??0};
}
