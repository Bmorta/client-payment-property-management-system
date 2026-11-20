import {moneyCents,buildSchedule,TERMS} from '../../../shared/paymentSchedule.js';
import {validateTerms,configureSchedule,validateMonthlyArrangement} from '../../../shared/contractTerms.js';
import {lotPrice} from './lotPricing.js';

const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
// Both direct assignment and reservation activation must use identical terms.
export function prepareNewContract(property,input,day){
 const total=lotPrice(property.areaSqm,property.pricePerSqm);
 if(total==null||total<=0)fail('Set this lot’s area and price per sqm before assigning it.');
 const totalCents=moneyCents(total),months=Number(input.months),contractDate=input.contractDate,firstDueDate=input.firstDueDate,downPaymentCents=moneyCents(input.downPayment||0);
 if(contractDate>day)fail('Contract date cannot be in the future.');
 const monitoringTerms=validateTerms(input.monitoringTerms?{...input.monitoringTerms,effectiveDate:contractDate}:null,contractDate);
 if(monitoringTerms&&input.monthlyInstallment===undefined)fail('Configure the monthly installment amount.');
 if(monitoringTerms)validateMonthlyArrangement(totalCents,downPaymentCents,months,input.monthlyInstallment,input.monthlyOverrideAcknowledged);
 const schedule=configureSchedule(buildSchedule(totalCents,months,firstDueDate,downPaymentCents,contractDate),monitoringTerms,input.monthlyInstallment);
 if(schedule.some(s=>s.dueDate<contractDate))fail('Due day cannot move an installment before the contract date.');
 return {monitoringTerms,monthlyInstallmentCents:schedule.find(s=>s.installment>0)?.amountCents,totalCents,months,termType:input.termType==='CUSTOM'||!TERMS.includes(months)?'CUSTOM':'PREDEFINED',firstDueDate:schedule.find(s=>s.installment>0)?.dueDate||firstDueDate,contractDate,downPaymentCents,areaSqm:property.areaSqm,pricePerSqm:property.pricePerSqm,schedule};
}
