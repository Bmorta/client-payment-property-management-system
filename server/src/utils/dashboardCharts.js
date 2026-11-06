import {effectivePayment} from "./paymentLedger.js";
export function dashboardCharts(accounts,expenses,from,to){
 const months=new Map();
 let [year,month]=from.slice(0,7).split('-').map(Number);
 while(`${year}-${String(month).padStart(2,'0')}`<=to.slice(0,7)){const key=`${year}-${String(month).padStart(2,'0')}`;months.set(key,{month:key,collectionsCents:0,expensesCents:0});if(++month>12){month=1;year++}}
 for(const a of accounts)for(const raw of a.payments||[]){const p=effectivePayment(raw);if(p.amountCents>0&&p.paymentDate>=from&&p.paymentDate<=to){const bucket=months.get(p.paymentDate.slice(0,7));if(bucket)bucket.collectionsCents+=p.amountCents}}
 for(const e of expenses)if(e.expenseDate>=from&&e.expenseDate<=to){const bucket=months.get(e.expenseDate.slice(0,7));if(bucket)bucket.expensesCents+=e.amountCents}
 return [...months.values()];
}
