import { summarizeAccount } from './accounting.js';
import { calculateCommissions } from './commissionLedger.js';
import { physicalFunding } from './fundingAccount.js';
import { cashPosition } from './financialReporting.js';
import {validSaleAccount,recordedSaleAccount,originalSale,originalContract,attributedSaleAgents,recordId,initialCommissionAgreement} from './salesClassification.js';

const closed = ['TRANSFERRED','ASSUMED','CANCELLED','FORFEITED','SUPERSEDED'];
export const isOriginalSale = originalSale;
export const agingLabels = ['1–30 days','31–60 days','61–90 days','Over 90 days'];
export function agingGroup(row, date) {
  const days = (Date.parse(date) - Date.parse(row.graceEnd || row.dueDate)) / 86400000;
  return days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : 3;
}
export const shiftDate = (date, days) => new Date(Date.parse(date) + days * 86400000).toISOString().slice(0,10);
export function managementMetrics({accounts, properties, financial, from, to, today, permissions, inventoryScoped=false,reservations=[]}) {
  const reservationByAccount=new Map(reservations.filter(r=>r.account).map(r=>[recordId(r.account),r]));
  const lots = new Map(properties.map(p => [String(p._id),p]));
  const scoped = accounts.filter(a => !inventoryScoped||lots.has(String(a.property)));
  const inventory = new Map();
  const monthly = new Map();
  for(let date=from.slice(0,7)+'-01'; date<=to; ){
    const month=date.slice(0,7);
    monthly.set(month,{month, actual:0, expected:0, sales:0, saleValue:0, cashIn:0, cashOut:0, earned:0, released:0});
    const next=new Date(date+'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth()+1); date=next.toISOString().slice(0,10);
  }
  for(const p of properties) inventory.set(p.status,(inventory.get(p.status)||0)+1);
  const result={inventory:Object.fromEntries(inventory),projects:{},months:[...monthly.values()],newContracts:0,contractSalesCents:0,activeContracts:0,cancelled:0,forfeited:0,cancelledInPeriod:0};
  const clients=new Set(),due=new Set(),overdue=new Set(),advance=new Set(),aging=agingLabels.map(label=>({label,amount:0,count:0}));
  const receivables={activeClients:0,dueToday:0,dueWeek:0,dueClients:0,overdueClients:0,overdueCents:0,advanceClients:0,fullyPaid:0,critical:0,expected:0,aging,unavailable:0};
  const commissions={earned:0,released:0,unreleased:0,releasable:0,releases:0,review:0,unavailable:0,agents:[]}, agents=new Map();
  const weekEnd=shiftDate(today,(7-new Date(today+'T00:00:00Z').getUTCDay())%7);
  for(const p of properties){
    const key=String(p.project);
    const row=result.projects[key]??={total:0,available:0,sold:0,reserved:0,newContracts:0,saleValue:0};
    row.total++;
    if(p.status==='AVAILABLE')row.available++;
    if(p.status==='SOLD')row.sold++;
    if(p.status==='RESERVED')row.reserved++;
  }
  for(const a of scoped){
    const date=originalContract(a)?.contractDate;
    if(!date || date>today || !recordedSaleAccount(a))continue;
    if(a.lifecycle==='CANCELLED'){
      result.cancelled++;
      const cancelledOn=a.cancellationOut?.effectiveDate;
      if(cancelledOn>=from&&cancelledOn<=to)result.cancelledInPeriod++;
    }
    if(a.lifecycle==='FORFEITED')result.forfeited++;
    const active=validSaleAccount(a);
    if(active)result.activeContracts++;
    if(active && a.client && a.clientStatus==='ACTIVE')clients.add(String(a.client));
    // Replacement contracts are operational changes, not fresh sales.
    const originalSaleInPeriod=date>=from&&date<=to&&isOriginalSale(a);
    if(originalSaleInPeriod){
      result.newContracts++;
      monthly.get(date.slice(0,7)).sales++;
      const project=result.projects[String(lots.get(String(a.property))?.project||a.project)];
      if(project)project.newContracts++;
      const price=originalContract(a)?.totalCents;
      if(permissions.financial&&Number.isSafeInteger(price)&&price>=0){
        result.contractSalesCents+=price;
        monthly.get(date.slice(0,7)).saleValue+=price;
        if(project)project.saleValue+=price;
      }
      if(permissions.financial){
        for(const key of attributedSaleAgents(a,reservationByAccount.get(recordId(a)))){
          const agent=agents.get(key)||{id:key,label:initialCommissionAgreement(a)?.agents?.find(r=>recordId(r.agent)===key)?.agentId||'Agent',earned:0,released:0,sales:0};
          agent.sales++;
          agents.set(key,agent);
        }
      }
    }
    if(!permissions.operations)continue;
    let summary;
    try{
      summary=summarizeAccount(a,today);
      if(active && !a.pendingCancellation && !closed.includes(summary.category)){
        if(summary.settlement?.status==='SETTLED'||summary.settlement?.status==='PRINCIPAL_FULLY_PAID')receivables.fullyPaid++;
        if(summary.advanceCoveredMonths>0)advance.add(String(a.client));
        if(['CRITICAL','FORFEITURE_REVIEW_REQUIRED'].includes(summary.riskStatus))receivables.critical++;
        const accountBuckets=new Set();
        for(const row of summary.schedule){
          if(row.retired || row.installment<=0)continue;
          if(row.dueDate>=from&&row.dueDate<=to){
            receivables.expected+=row.amountCents;
            monthly.get(row.dueDate.slice(0,7)).expected+=row.amountCents;
          }
          if(row.balanceCents<=0)continue;
          if(row.dueDate===today){receivables.dueToday+=row.balanceCents;due.add(String(a.client));}
          if(row.dueDate>=today&&row.dueDate<=weekEnd)receivables.dueWeek+=row.balanceCents;
          if(row.overdue){
            overdue.add(String(a.client));
            const bucket=agingGroup(row,today);
            aging[bucket].amount+=row.balanceCents;
            accountBuckets.add(bucket);
            receivables.overdueCents+=row.balanceCents;
          }
        }
        for(const bucket of accountBuckets)aging[bucket].count++;
      }
    }catch{receivables.unavailable++;}
    if(!permissions.financial)continue;
    if(!summary){commissions.unavailable++;continue;}
    try{
      const records=calculateCommissions(a,summary,{asOf:today}).records;
      for(const r of records){
        const agent=agents.get(String(r.agent))||{id:String(r.agent), label:r.agentId||'Agent',earned:0,released:0,sales:0};
        agent.earned+=r.earnedCents;agent.released+=r.releasedCents;
        agents.set(agent.id,agent);
        commissions.earned+=r.earnedCents;
        commissions.released+=r.releasedCents;
        commissions.unreleased+=r.unreleasedCents;
        commissions.releasable+=r.releasableCents;
        if(r.releasableCents>0)commissions.releases++;
        if(r.heldCents||r.recoveryDueCents||r.historicalVerificationCents)commissions.review++;
        for(const allocation of r.sourceAllocations||[]){
          if(allocation.effectiveDate>=from&&allocation.effectiveDate<=to){
            monthly.get(allocation.effectiveDate.slice(0,7)).earned+=allocation.commissionCents||0;
          }
        }
      }
    }catch{commissions.unavailable++;}
  }
  Object.assign(receivables,{activeClients:clients.size,dueClients:due.size,overdueClients:overdue.size,advanceClients:advance.size});
  if(permissions.operations)result.receivables=receivables;
  if(!permissions.financial)return result;
  commissions.agents=[...agents.values()].sort((a,b)=>b.earned-a.earned).slice(0,10);
  const allowed = row => !inventoryScoped||lots.has(String(row.property?._id||row.property));
  const accountIds = new Set(scoped.map(a=>String(a._id)));
  let todayCollections=0,monthCollections=0,periodCollections=0;
  const todayFunding={CASH:0,NONCASH:0,unclassified:0};
  for(const p of financial.collections){
    if(!p.posted||p.paymentDate>today||!allowed(p))continue;
    if(p.paymentDate===today){
      todayCollections+=p.amountCents;
      todayFunding[physicalFunding(p.method,p.fundingAccount)||'unclassified']+=p.amountCents;
    }
    if(p.paymentDate.slice(0,7)===today.slice(0,7)&&p.paymentDate<=today)monthCollections+=p.amountCents;
    if(p.paymentDate>=from&&p.paymentDate<=to){periodCollections+=p.amountCents;monthly.get(p.paymentDate.slice(0,7)).actual+=p.amountCents;}
  }
  for(const p of financial.payouts){
    if((!inventoryScoped||accountIds.has(String(p.accountId)))&&p.date>=from&&p.date<=to&&p.date<=today)monthly.get(p.date.slice(0,7)).released+=p.amountCents;
  }
  const daily=cashPosition(financial,financial.entries,today,today,{includeDaily:false});
  const period=from<=today?cashPosition(financial,financial.entries,from,to<today?to:today,{includeDaily:false}):{events:[],available:true};
  for(const event of period.events) {
    const row=monthly.get(event.date.slice(0,7));
    if(event.amountCents>0)row.cashIn+=event.amountCents;
    else row.cashOut-=event.amountCents;
  }
  const buckets={};
  const expenseById = new Map(financial.expenses.map(e=>[e.expenseId,e]));
  const entryById = new Map(financial.entries.map(e=>[e.entryId,e]));
  for(const event of daily.events){
    const expense=event.kind==='EXPENSE'?expenseById.get(event.reference):null;
    const key=expense?.commissionPayoutId?'COMMISSION_PAYOUT':
      expense?.businessPayoutId||(event.kind==='OUTFLOW'&&entryById.get(event.entryId)?.businessPayoutId)?'BUSINESS_PAYOUT':event.kind;
    buckets[key]=(buckets[key]||0)+Math.abs(event.amountCents);
  }
  result.finance={todayCollections,todayFunding,monthCollections,periodCollections,cash:{opening:daily.openingCents,closing:daily.closingCents,reasons:daily.reasons,events:buckets,periodVerified:period.available}};
  result.commissions=commissions;
  return result;
}
