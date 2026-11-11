import {validDate,validTerm,monthDate} from './paymentSchedule.js';
const split=(amount,n)=>Array.from({length:n},(_,i)=>Math.floor(amount/n)+(i<amount%n?1:0));
export function transferSchedule({totalCents,downPaymentCents,creditCents,months,firstDueDate,dueDay,effectiveDate}){
 const fail=()=>{throw Object.assign(new Error('Check transfer principal, credit, term and due dates.'),{statusCode:400})};
 if(![totalCents,downPaymentCents,creditCents].every(n=>Number.isSafeInteger(n)&&n>=0)||!validTerm(months)||creditCents>totalCents||downPaymentCents>totalCents||!validDate(firstDueDate)||!validDate(effectiveDate)||firstDueDate<effectiveDate||!Number.isInteger(dueDay)||dueDay<1||dueDay>31)fail();
 const dpCredit=Math.min(creditCents,downPaymentCents),monthlyCredit=creditCents-dpCredit,financedCents=totalCents-downPaymentCents-monthlyCredit,net=split(financedCents,months),credits=split(monthlyCredit,months);
 const schedule=[{installment:0,dueDate:effectiveDate,amountCents:downPaymentCents-dpCredit},...net.map((amountCents,i)=>{const anchor=monthDate(firstDueDate.slice(0,7)+'-01',i),[y,m]=anchor.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();return {installment:i+1,dueDate:anchor.slice(0,7)+'-'+String(Math.min(dueDay,last)).padStart(2,'0'),amountCents}})];
 if(schedule[1].dueDate!==firstDueDate||schedule.reduce((n,s)=>n+s.amountCents,0)+creditCents!==totalCents)fail();
 return {dpCredit,financedCents,net,schedule,allocations:[...(dpCredit?[{installmentId:'I0',amountCents:dpCredit}]:[]),...credits.map((amountCents,i)=>({installmentId:'I'+(i+1),amountCents})).filter(a=>a.amountCents>0)]};
}
export function transferDateDefaults(schedule,effectiveDate,dueDay){
 const next=schedule.find(s=>s.installment>0&&s.balanceCents>0),day=Number(dueDay)||Number(next?.dueDate.slice(-2))||Number(effectiveDate.slice(-2));
 let anchor=next?.dueDate>=effectiveDate?next.dueDate:effectiveDate;
 const clamped=date=>{const [y,m]=date.split('-').map(Number);return date.slice(0,7)+'-'+String(Math.min(day,new Date(Date.UTC(y,m,0)).getUTCDate())).padStart(2,'0')};
 let first=clamped(anchor);if(first<effectiveDate)first=clamped(monthDate(anchor.slice(0,7)+'-01',1));
 return {startDate:effectiveDate,firstDueDate:first,dueDay:day,months:schedule.filter(s=>s.installment>0&&s.balanceCents>0).length};
}
