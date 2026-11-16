import {createHash} from 'node:crypto';
const money=n=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format((n||0)/100);
const overdue=new Set(['OVERDUE','OVERDUE_WITH_PENALTY','GRACE_PERIOD_EXPIRED']);
const due=new Set(['DUE_TODAY','WITHIN_GRACE_PERIOD','UPCOMING_DUE']);
export function groupNotifications(rows){
 const groups=new Map(),result=[];
 for(const n of rows){
  let issue,subject;
  if(n.monitoringAlert&&(overdue.has(n.status)||due.has(n.status))){issue=overdue.has(n.status)?'Overdue installments':'Upcoming and due installments';subject=n.clientIdentity||String(n.accountId)}
  else if(n.sourceModel==='SiteRequest'&&n.siteReminder){issue=['OVERDUE','UNATTENDED'].includes(n.status)?'Site visit needs attention':n.status;subject=String(n.accountId)}
  else if(n.commissionAlert&&n.agentIdentity){issue=n.status;subject=n.agentIdentity}
  // Decisions, approvals, lifecycle changes and urgent risk alerts remain separate.
  if(!issue){result.push({...n,title:n.subjectName||'Office notification',summary:n.message,priority:/CRITICAL|REVIEW|PENDING|RECOVERY|HOLD/.test(n.status||'')?'High':'Normal'});continue}
  const key=JSON.stringify([n.sourceModel,subject,issue,n.monitoringAlert&&n.active===false?'resolved':'active']);
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);
 }
 for(const [key,items]of groups){
  const members=[...new Map(items.map(n=>[`${n.accountId}:${n.id}`,n])).values()],latest=members.reduce((a,b)=>new Date(a.createdAt||0)>new Date(b.createdAt||0)?a:b),accounts=[...new Map(members.map(n=>[String(n.accountId),n])).values()];
  const periods=new Map();for(const n of accounts)for(const s of n.monitoringSchedule||[]){if(s.balanceCents>0&&(overdue.has(n.status)?s.overdue:!s.overdue&&members.some(m=>String(m.accountId)===String(n.accountId)&&m.alertKey?.startsWith((s.installmentId||'I'+s.installment)+':'))))periods.set(`${n.accountId}:${s.installmentId||s.installment}`,s)}
  const principal=[...periods.values()].reduce((sum,s)=>sum+(s.balanceCents||0),0),penalties=accounts.reduce((sum,n)=>sum+(n.outstandingPenaltyCents||0),0),isOverdue=members.some(n=>overdue.has(n.status)||n.status==='UNATTENDED');
  const summary=latest.monitoringAlert&&latest.active===false?`${members.length} resolved installment alert(s). Expand to view the history.`:latest.monitoringAlert?(periods.size?`${periods.size} ${isOverdue?'overdue':'unpaid'} installment(s) · ${money(principal)} principal · ${money(penalties)} outstanding penalties`:`${members.length} related installment alerts. Open the accounts for current balances.`):latest.sourceModel==='SiteRequest'?`${members.length} related visit reminder(s) · ${members.map(n=>String(n.status||'').toLowerCase().replace('followup','follow-up required')).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}`:`${members.length} related commission update(s) · ${String(latest.status||'').replaceAll('_',' ').toLowerCase()}`;
  const clean=n=>{const {monitoringSchedule,outstandingPenaltyCents,...rest}=n;return rest};
  result.push({...clean(latest),id:'group-'+createHash('sha256').update(key).digest('hex'),grouped:true,title:latest.subjectName||'Client account',summary,message:summary,priority:isOverdue||/HOLD|RECOVERY|REVIEW/.test(latest.status||'')?'High':'Normal',read:members.every(n=>n.read),count:members.length,details:members.map(clean)});
 }
 return result.map(n=>{const {monitoringSchedule,outstandingPenaltyCents,...clean}=n;return clean}).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)||String(a.id).localeCompare(String(b.id)));
}
