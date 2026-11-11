import {buildSchedule,moneyCents} from './paymentSchedule.js';
import {configureSchedule,validateMonthlyArrangement} from './contractTerms.js';

// Transferred credit has already reduced the replacement schedule. Never finance it again.
export function agreementSchedule(contract,input,terms){
 const months=Number(input.months),dp=moneyCents(input.downPayment),credit=contract.transferIn?.creditCents||0;
 if(credit&&dp!==contract.downPaymentCents)throw Object.assign(new Error('Preserve the approved down payment and transfer-credit allocation. Use a reviewed contract amendment to change them.'),{statusCode:409});
 const dpCredit=Math.min(credit,dp),netTotal=contract.totalCents-credit,netDP=dp-dpCredit;
 const monthly=input.monthlyInstallment??((contract.monthlyInstallmentCents||contract.schedule.find(s=>s.installment>0)?.amountCents||0)/100);
 const unchanged=months===contract.months&&dp===contract.downPaymentCents&&input.firstDueDate===contract.firstDueDate&&moneyCents(monthly)===(contract.monthlyInstallmentCents||contract.schedule.find(s=>s.installment>0)?.amountCents);
 const schedule=unchanged?configureSchedule(contract.schedule,terms):(()=>{
  if(terms)validateMonthlyArrangement(netTotal,netDP,months,monthly,input.monthlyOverrideAcknowledged);
  return configureSchedule(buildSchedule(netTotal,months,input.firstDueDate,netDP,contract.contractDate),terms,terms?monthly:undefined);
 })();
 if(schedule.reduce((n,s)=>n+s.amountCents,0)!==netTotal)throw Object.assign(new Error('The schedule does not reconcile with the contract price less transferred credit. Review the agreement before saving.'),{statusCode:409});
 return schedule;
}
