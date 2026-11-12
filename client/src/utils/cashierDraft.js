import {quoteUnpaidInstallments} from '../../../shared/installmentQuote.js';
import {paymentRemarks} from '../../../shared/paymentRemarks.js';

export function cashierRow(row, context) {
  let quote=null,error='';
  if(row.monthsToPay && context) {
    try { quote=quoteUnpaidInstallments(context.schedule,row.monthsToPay); }
    catch(e) { error=e.message; }
  }
  const amount = row.monthsToPay ? quote ? (quote.amountCents/100).toFixed(2) : '' : row.principalAmount;
  const type = row.monthsToPay ? 'INSTALLMENT' : row.type;
  const cents = Math.round(Number(amount||0)*100);
  const schedule=(context?.schedule||[]).map(r=>({...r})),allocations=[];
  let remaining=Number.isSafeInteger(cents)?cents:0;
  for(const r of schedule) {
    if(r.retired||r.balanceCents<=0||type==='PENALTY'||type==='INSTALLMENT'&&r.installment===0||type==='DOWN_PAYMENT'&&r.installment!==0)continue;
    const amountCents=Math.min(remaining,r.balanceCents);
    if(amountCents){r.balanceCents-=amountCents;allocations.push({installment:r.installment,dueDate:r.dueDate,amountCents});remaining-=amountCents;}
  }
  for(const [assessmentId,amount] of Object.entries(row.penaltyDecision==='NOW'?row.selected||{}:{})) {
    const assessment=context?.assessments.find(a=>a.assessmentId===assessmentId);
    if(assessment&&Number(amount)>0)allocations.push({...assessment,assessmentId,amountCents:Math.round(Number(amount)*100)});
  }
  return {amount,type,quote,error,suggestedRemarks:paymentRemarks(allocations,schedule)};
}

export function cashTender(totalCents,method,tendered) {
  const cents=tendered===''?totalCents:Math.round(Number(tendered)*100);
  const valid=method!=='CASH'||Number.isSafeInteger(cents)&&cents>=totalCents;
  return {valid,tenderedCents:method==='CASH'?cents:totalCents,changeCents:method==='CASH'&&Number.isFinite(cents)?Math.max(0,cents-totalCents):0,remainingCents:method==='CASH'&&Number.isFinite(cents)?Math.max(0,totalCents-cents):0};
}
