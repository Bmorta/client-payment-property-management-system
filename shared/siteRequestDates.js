const manilaDate=value=>{
 const date=new Date(value);
 return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):'';
};
export const SITE_REQUEST_DATE_BASES=['activity','request','scheduled','actual'];
export function matchesSiteRequestDates(row,{from,to,dateBasis='activity'}){
 if(!from&&!to)return true;
 const dates=dateBasis==='request'?[row.requestDate]:dateBasis==='scheduled'?[manilaDate(row.schedule?.start)]:dateBasis==='actual'?(row.reports||[]).map(r=>manilaDate(r.actualStart)):[manilaDate(row.schedule?.start||row.preferredStart)||row.requestDate];
 return dates.some(day=>day&&(!from||day>=from)&&(!to||day<=to));
}
