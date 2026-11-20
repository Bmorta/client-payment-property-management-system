import {originalContract,originalSale,recordedSaleAccount,recordId} from './salesClassification.js';
import {splitSalesValue} from './salesPlanningRules.js';
import {validDate} from './accounting.js';

const range=(date,from,to)=>validDate(date)&&date>=from&&date<=to;
const safeSum=(rows,key)=>{const total=rows.reduce((n,r)=>n+r[key],0);if(!Number.isSafeInteger(total))throw Object.assign(new Error('Performance total exceeds supported precision.'),{statusCode:409});return total};
const ratio=(n,d)=>d>0?n/d:null;
const monthEnd=day=>{const [y,m]=day.split('-').map(Number);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
export const previousYearDate=date=>{const [y,m,d]=date.split('-').map(Number);return (y-1)+'-'+String(m).padStart(2,'0')+'-'+String(Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate())).padStart(2,'0')};
export function originalBookings(accounts){
 return accounts.filter(a=>recordedSaleAccount(a)&&originalSale(a)).flatMap(a=>{
  const contract=originalContract(a),date=contract?.contractDate,valueCents=contract?.totalCents;
  if(!validDate(date)||!Number.isSafeInteger(valueCents)||valueCents<0)return [];
  const shares=a.salesAttribution?.shares||[];
  return [{id:recordId(a),projectId:recordId(a.project),date,valueCents,shares:shares.length?splitSalesValue(valueCents,shares):[]}];
 });
}
const agentContributions=(bookings,agent='')=>bookings.flatMap(b=>b.shares.filter(s=>!agent||s.agentId===agent).map(s=>({...s,bookingId:b.id,date:b.date})));
export function buildSalesPerformance({accounts,selectedIds,agents=[],projects=[],targets=[],from,to,today,planningYear=to.slice(0,4),project='',agent='',type='',status='',inventory=null}){
 const all=originalBookings(accounts).filter(b=>b.date<=today),selected=all.filter(b=>selectedIds.has(b.id));
 const current=selected.filter(b=>range(b.date,from,to)),priorFrom=previousYearDate(from),priorTo=previousYearDate(to),prior=selected.filter(b=>range(b.date,priorFrom,priorTo));
 const gross=safeSum(current,'valueCents'),priorGross=safeSum(prior,'valueCents');
 const monthStart=to.slice(0,7)+'-01',monthLast=monthEnd(to),monthBookings=selected.filter(b=>range(b.date,monthStart,to)),monthGross=safeSum(monthBookings,'valueCents'),elapsed=Number(to.slice(-2)),days=Number(monthLast.slice(-2));
 // Use BigInt to avoid a precision loss when scaling large centavo totals.
 const projection=Number((BigInt(monthGross)*BigInt(days)+BigInt(Math.floor(elapsed/2)))/BigInt(elapsed));
 const monthProjection=Number.isSafeInteger(projection)?projection:null;
 const yearStart=to.slice(0,4)+'-01-01',yearEnd=to.slice(0,4)+'-12-31',yearGross=safeSum(selected.filter(b=>range(b.date,yearStart,to)),'valueCents');
 const yearElapsed=(Date.parse(to)-Date.parse(yearStart))/86400000+1,yearDays=(Date.parse(yearEnd)-Date.parse(yearStart))/86400000+1;
 const annualProjection=Number((BigInt(yearGross)*BigInt(yearDays)+BigInt(Math.floor(yearElapsed/2)))/BigInt(yearElapsed));
 const agentNames=new Map(agents.map(a=>[recordId(a),a.fullName])),projectNames=new Map(projects.map(p=>[recordId(p),p.projectName]));
 const grouped=new Map();for(const s of agentContributions(current,agent)){const row=grouped.get(s.agentId)||{agentId:s.agentId,name:agentNames.get(s.agentId)||s.agentId,valueCents:0,unitBps:0,primarySales:0};row.valueCents=safeSum([row,s],'valueCents');row.unitBps+=s.shareBps;if(s.role==='PRIMARY')row.primarySales++;grouped.set(s.agentId,row)}
 const leaderboard=[...grouped.values()].sort((a,b)=>b.valueCents-a.valueCents||b.unitBps-a.unitBps||a.agentId.localeCompare(b.agentId)).map((r,i)=>({...r,rank:i+1}));
 const year=planningYear,targetRows=[];
 for(const record of targets){
  const v=record.value;if(!v||!v.period.startsWith(year))continue;
  if(v.scope==='COMPANY'&&(project||agent)||v.scope==='PROJECT'&&(agent||project&&v.subject!==project)||v.scope==='AGENT'&&(project||agent&&v.subject!==agent))continue;
  const start=v.periodType==='YEAR'?v.period+'-01-01':v.period+'-01',end=v.periodType==='YEAR'?v.period+'-12-31':monthEnd(start),cutoff=today<end?today:end;
  const bookings=all.filter(b=>range(b.date,start,cutoff)&&(v.scope!=='PROJECT'||b.projectId===v.subject));
  const shares=v.scope==='AGENT'?agentContributions(bookings,v.subject):null;
  const actualValueCents=shares?safeSum(shares,'valueCents'):safeSum(bookings,'valueCents'),actualUnitBps=shares?safeSum(shares,'shareBps'):bookings.length*10000;
  const unverified=shares?bookings.filter(b=>!b.shares.length):[];
  targetRows.push({id:record._id,version:record.version,...v,label:v.scope==='COMPANY'?'Office total':v.scope==='PROJECT'?projectNames.get(v.subject)||v.subject:agentNames.get(v.subject)||v.subject,start,end,cutoff,actualValueCents,actualUnitBps,valueAchievement:v.active?ratio(actualValueCents,v.valueCents):null,unitAchievement:v.active?ratio(actualUnitBps,v.units*10000):null,unverifiedBookingCount:unverified.length,unverifiedValueCents:safeSum(unverified,'valueCents')});
 }
 targetRows.sort((a,b)=>a.period.localeCompare(b.period)||a.scope.localeCompare(b.scope)||a.label.localeCompare(b.label));
 const unverified=current.filter(b=>!b.shares.length);
 const sellThrough=inventory&&!agent&&!type&&!status?{...inventory,rate:ratio(inventory.sold,inventory.sold+inventory.available+inventory.reserved)}:null;
 return {year,targets:targetRows,leaderboard,unverifiedBookingCount:unverified.length,unverifiedValueCents:safeSum(unverified,'valueCents'),comparison:{from,to,priorFrom,priorTo,grossCents:gross,priorGrossCents:priorGross,contracts:current.length,priorContracts:prior.length,valueChange:ratio(gross-priorGross,priorGross),countChange:ratio(current.length-prior.length,prior.length)},forecast:{monthStart,asOf:to,monthEnd:monthLast,elapsedDays:elapsed,daysInMonth:days,actualCents:monthGross,projectedCents:monthProjection},annualForecast:{yearStart,asOf:to,yearEnd,elapsedDays:yearElapsed,daysInYear:yearDays,actualCents:yearGross,projectedCents:Number.isSafeInteger(annualProjection)?annualProjection:null},sellThrough,scope:'Targets follow their full calendar month/year through today (not the report date or current-status/type filters). Agent achievements and rankings use approved attribution shares only. Unverified bookings remain in office/project totals and are excluded from weighted agent results. Comparison and run-rate forecast use the selected report scope; forecast is a simple daily pace illustration, not a guaranteed sale. Current sell-through excludes restricted, archived and unresolved lots.'};
}
