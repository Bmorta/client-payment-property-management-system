// Read-only dates from the effective ledger schedule; never reschedule a contract here.
export function contractDates(account,asOf){
 const schedule=account.summary?.schedule||account.contract?.schedule||[];
 const installments=schedule.filter(r=>r.installment>0).sort((a,b)=>a.installment-b.installment);
 const start=installments[0]?.dueDate||null,end=installments.at(-1)?.dueDate||null;
 const days=end&&asOf?Math.max(0,Math.ceil((Date.parse(end+'T00:00:00Z')-Date.parse(asOf+'T00:00:00Z'))/86400000)):null;
 let months=null,remainder=null;
 if(days!==null){months=0;const date=new Date(asOf+'T00:00:00Z');if(end>=asOf){months=(+end.slice(0,4)-date.getUTCFullYear())*12+(+end.slice(5,7)-date.getUTCMonth()-1);const monthDate=n=>{const first=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+n,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(date.getUTCDate(),last));return first};if(monthDate(months).toISOString().slice(0,10)>end)months--;remainder=Math.round((Date.parse(end+'T00:00:00Z')-monthDate(months).getTime())/86400000)}else remainder=0;}
 return {start,end,dueDay:account.contract?.dueDay??(start?Number(start.slice(8)):null),total:installments.length,paid:account.summary?.fullyPaidMonths??installments.filter(r=>r.balanceCents===0).length,unpaid:installments.filter(r=>Number(r.balanceCents??r.amountCents)>0).length,days,months,remainder,past:!!end&&!!asOf&&end<asOf};
}
