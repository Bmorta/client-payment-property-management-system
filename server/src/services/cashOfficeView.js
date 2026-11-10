import {createHash} from 'node:crypto';
import {cashPosition} from '../utils/financialReporting.js';
// Projection only: the authoritative cashPosition calculation is unchanged.
export function cashOfficeView(data,from,to,{q='',kind='',methods=[]}={}){
 const cash=cashPosition(data,data.entries,from,to),payments=new Map(data.collections.map(p=>[p.paymentId,p])),expenses=new Map(data.expenses.map(e=>[e.expenseId,e]));
 let balance=cash.openingCents;
 const events=cash.events.map((e,i)=>{
  if(balance!==null)balance+=e.amountCents;
  const payment=payments.get(e.reference),expense=expenses.get(e.reference),entry=data.entries.find(r=>r.entryId===e.entryId),payout=data.payouts.find(p=>p.payoutId===e.reference);
  const refund=(data.refunds||[]).find(r=>r.releaseId===e.reference),recovery=data.recoveries.find(r=>r.requestId===e.reference);
  const source=payment||expense||entry||payout||refund||recovery;
  return {...e,sequence:i+1,method:source?.method||'CASH',sourceId:payment?.paymentId||expense?.expenseId||entry?.entryId||e.reference,party:e.recipient||[payment?.client?.firstName,payment?.client?.lastName].filter(Boolean).join(' ')||expense?.payee||'',source:payment?'Client Collection':expense?'Expense':payout?'Commission Payout':e.kind.replaceAll('_',' '),sourceUrl:payment?`/payment-transactions?${payment.receiptNumber?'receipt':'q'}=${encodeURIComponent(payment.receiptNumber||payment.paymentId)}`:expense?`/expenses?selected=${expense._id}`:payout||recovery?`/commissions?account=${(payout||recovery).accountId}`:refund?`/clients/${refund.client?._id||refund.client}/accounts?tab=properties`:entry?.businessPayoutId?`/payouts?q=${encodeURIComponent(entry.businessPayoutId)}`:`/reports?view=cash&focus=movements&cashTab=adjustments&cashEntry=${encodeURIComponent(e.entryId||e.reference)}`,cashInCents:Math.max(0,e.amountCents),cashOutCents:Math.max(0,-e.amountCents),runningCents:cash.available?balance:null};
 });
 const rows=events.filter(e=>(!kind||e.kind===kind)&&(!methods.length||methods.includes(e.method))&&[e.reference,e.sourceId,e.party,e.source,e.remarks].join(' ').toLowerCase().includes(q.toLowerCase()));
 const sum=k=>events.filter(e=>k.includes(e.kind)).reduce((n,e)=>n+e.amountCents,0);
 const summary={openingCents:cash.openingCents,closingCents:cash.closingCents,collectionsCents:cash.collectionsCents,cashReceivedCents:cash.collectionsCents+cash.otherInflowsCents,cashAddedCents:sum(['INFLOW','BANK_WITHDRAWAL']),expensesCents:cash.expensesCents,releasedCents:cash.otherOutflowsCents,turnoversCents:cash.turnoversCents,bankDepositsCents:cash.bankDepositsCents};
 const snapshot=createHash('sha256').update(JSON.stringify({from,to,summary,rows,available:cash.available,reasons:cash.reasons})).digest('hex');
 return {from,to,summary,cash,rows,count:rows.length,snapshot,scope:'Cash balances use the complete ledger; transaction filters affect rows only. Date-only records are ordered by date/reference; intraday ordering is informational.'};
}
