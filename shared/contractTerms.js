import { validDate, moneyCents, monthDate } from "./paymentSchedule.js";
export const calendarDay=(value=new Date())=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
export const addDays=(date,n)=>new Date(Date.parse(`${date}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
export function validateTerms(input,contractDate){
 if(input==null)return null;
 if(typeof input!=="object"||Array.isArray(input))fail("Invalid contractual configuration.");
 const integer=(key,min,max)=>{if(!["number","string"].includes(typeof input[key])||String(input[key]).trim()==="")fail(`Configure ${key}.`);const n=Number(input[key]);if(!Number.isSafeInteger(n)||n<min||n>max)fail(`Invalid ${key}.`);return n};
 const rate=moneyCents(input.penaltyPercentage);if(rate>10000)fail("Penalty percentage must be between 0 and 100.");
 const terms={pendingPaymentPolicy:input.pendingPaymentPolicy===true,dueDay:integer("dueDay",1,31),graceDays:integer("graceDays",0,366),penaltyRateBps:rate,penaltyPercentage:rate/100,
  forfeitureMonths:integer("forfeitureMonths",1,1200),criticalMonths:integer("criticalMonths",0,1200),reminderDays:integer("reminderDays",0,366),
  penaltyStatus:input.penaltyStatus,penaltyBasis:input.penaltyBasis,allocationPriority:input.allocationPriority,frequency:input.frequency,effectiveDate:input.effectiveDate};
 if(terms.pendingPaymentPolicy){if(terms.penaltyStatus!=="DISABLED"||terms.penaltyBasis||terms.allocationPriority||terms.frequency!=="MONTHLY")fail("Pending payment policies must remain disabled with no invented basis or allocation priority.");terms.penaltyBasis=null;terms.allocationPriority=null;}
 else if(!["ACTIVE","WAIVED","DISABLED"].includes(terms.penaltyStatus)||!["FULL_INSTALLMENT","UNPAID_BALANCE"].includes(terms.penaltyBasis)||!["PRINCIPAL_FIRST","PENALTY_FIRST"].includes(terms.allocationPriority)||terms.frequency!=="MONTHLY")fail("Choose explicit penalty status, basis, monthly frequency and allocation priority.");
 if(!validDate(terms.effectiveDate)||terms.effectiveDate<contractDate||terms.criticalMonths>=terms.forfeitureMonths)fail("Check effective date and set critical months below the forfeiture review threshold.");
 return terms;
}
export function configureSchedule(schedule,terms,monthlyAmount){
 if(!terms)return schedule;
 let rows=schedule.map(s=>({...s,dueDate:s.installment===0?s.dueDate:(()=>{const [y,m]=s.dueDate.split("-").map(Number);return new Date(Date.UTC(y,m-1,Math.min(terms.dueDay,new Date(Date.UTC(y,m,0)).getUTCDate()))).toISOString().slice(0,10)})()}));
 if(monthlyAmount!==undefined){const cents=moneyCents(monthlyAmount),monthly=rows.filter(s=>s.installment>0),balance=monthly.reduce((n,s)=>n+s.amountCents,0);if(cents<=0||cents*(monthly.length-1)>=balance||cents*monthly.length<balance)fail("Monthly amount must cover the principal over the chosen term; only the final installment may be smaller.");rows=rows.map(s=>s.installment>0?{...s,amountCents:s.installment===monthly.length?balance-cents*(monthly.length-1):cents}:s)}
 return rows;
}

export function computedMonthly(totalCents,downPaymentCents,months){if(![totalCents,downPaymentCents].every(Number.isSafeInteger)||!Number.isSafeInteger(months)||months<1||totalCents<=downPaymentCents||downPaymentCents<0)return null;return Number((BigInt(totalCents-downPaymentCents)+BigInt(months)-1n)/BigInt(months))}
export function validateMonthlyArrangement(total,dp,months,amount,acknowledged){const suggested=computedMonthly(total,dp,months);if(amount===undefined||suggested==null)return;const actual=moneyCents(amount);if(!Number.isSafeInteger(actual*months))fail('Monthly schedule exceeds supported centavo precision.');if(actual!==suggested&&actual*months!==total-dp&&acknowledged!==true)fail('Confirm the final-installment balancing arrangement for the manually entered monthly amount.');}
