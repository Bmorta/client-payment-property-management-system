export const SALES_REPORT_TYPES=['SUMMARY','DETAIL','AGENTS','INDIVIDUAL','FULL'];
export const SALES_REPORT_TITLES={SUMMARY:'Sales Summary',DETAIL:'Detailed Sales Report',AGENTS:'Agent Performance Report',INDIVIDUAL:'Individual Agent Performance',FULL:'Complete Sales Monitoring Report'};
export const SALES_PAPERS={A4:[210,297],LETTER:[215.9,279.4],LONG:[215.9,330.2]};
const php=x=>x==null?'Unavailable':x/100;
const status=x=>String(x||'').replaceAll('_',' ');
const shares=r=>r.salesAttribution?.shares?.map((s,i)=>(r.agents[i]||s.agentId)+' '+s.role+' '+(s.shareBps/100).toFixed(2)+'%').join('; ')||'Not verified';
export const agentSalesColumns=[['agentCode','Agent ID'],['label','Agent'],['propertiesSold','Unique properties participated'],['newContracts','Original contract participations'],['primarySales','Primary sales'],['weightedUnits','Weighted sales units'],['creditedSalesCents','Approved credited sales PHP'],['grossSalesCents','Associated gross PHP'],['unverifiedSales','Unverified bookings'],['activeContracts','Valid contracts'],['cancelled','Cancelled'],['forfeited','Forfeited'],['converted','Reservation conversions']];
export const agentFinanceColumns=[['agentCode','Agent ID'],['label','Agent'],['periodCollectionsCents','Associated period receipts PHP'],['currentReceivableCents','Associated current principal PHP'],['fullyPaid','Verified fully paid'],['installment','Installment'],['settlementPending','Settlement pending']];
export const agentCommissionColumns=[['agentCode','Agent ID'],['label','Agent'],['periodEarnedCents','Period earnings PHP'],['periodReleasedCents','Period releases PHP'],['earnedCents','Cumulative earned PHP'],['releasedCents','Cumulative released PHP'],['unreleasedCents','Earned unreleased PHP'],['releasableCents','Releasable PHP'],['recoveredCents','Recovered PHP'],['recoveryDueCents','Recovery due PHP'],['adjustedRecords','Adjusted records']];
export const agentCell=(r,key)=>key.endsWith('Cents')?php(r[key]):r[key]??'';
const agentSection=(title,columns,agents)=>({title,headers:columns.map(c=>c[1]),rows:agents.map(r=>columns.map(([k])=>agentCell(r,k)))});
export const salesRegisterColumns=['Contract','Booking date','Buyer','Project','Phase / Block / Lot','Property ID','Agent(s)','Approved shares','Contract value PHP','Principal satisfied PHP','Period receipts PHP','Current principal PHP','Contract type','Current status'];
export const salesRegisterRow=r=>[r.contractId,r.date,r.client,r.project,[r.phase,r.block,r.lot].map(x=>x??'—').join(' / '),r.property,r.agents.join(', ')||'Unassigned',shares(r),php(r.valueCents),php(r.principalPaidCents),php(r.periodCollectionsCents),php(r.receivableCents),status(r.type),status(r.status)];
export function salesReportView(data,type){
 if(!SALES_REPORT_TYPES.includes(type)||type==='FULL')throw Error('Choose a focused sales report.');
 if(type==='INDIVIDUAL'&&!data.filters?.agent)throw Error('Select an agent in the report filters first.');
 const s=data.summary,agents=data.agents||[],individual=type==='INDIVIDUAL'?agents.find(r=>r.id===data.filters.agent):null;
 const summary=[
 ['Original contracts in period',s.newContracts],['Unique properties with original bookings',s.uniquePropertiesSold],['Gross original bookings PHP',php(s.grossSalesCents)],['Net recorded movement PHP',php(s.netMovementCents)],['Current valid contract value PHP',php(s.currentValueCents)],['Current valid contracts',s.activeContracts],['Current installment contracts',s.installment],['Verified fully paid',s.fullyPaid],['Settlement pending',s.settlementPending],['Actual posted receipts PHP',php(s.collectionsCents)],['Current principal receivables PHP',php(s.receivableCents)],['Closing principal receivables PHP',php(s.closingReceivableCents)],['Cancelled in period',s.cancelled],['Cancelled value PHP',php(s.cancelledCents)],['Forfeited in period',s.forfeited],['Forfeited value PHP',php(s.forfeitedCents)]
 ];
 const sections=[];
 if(individual)sections.push({title:'Selected agent',headers:['Agent ID','Agent','Status','Assigned projects'],rows:[[individual.agentCode,individual.label,individual.agentStatus,data.agentOptions?.find(a=>a.id===individual.id)?.projects?.join(', ')||'None recorded']]});
 if(type==='SUMMARY'){
  sections.push({title:'Sales summary',headers:['Measure','Value'],rows:summary});
  sections.push({title:'Sales by project',headers:['Project','Original contracts','Gross booked PHP','Current valid PHP','Valid contracts','Cancelled','Forfeited'],rows:data.projects.map(r=>[r.label,r.newContracts,php(r.grossSalesCents),php(r.currentValueCents),r.activeContracts,r.cancelled,r.forfeited])});
 }
 if(type==='DETAIL'||type==='INDIVIDUAL')sections.push({title:'Contract register',headers:salesRegisterColumns,rows:data.register.map(salesRegisterRow)});
 if(type==='AGENTS'||type==='INDIVIDUAL'){
  sections.push(agentSection('Sales performance — approved vs association',agentSalesColumns,agents),agentSection('Collections & receivables — non-additive',agentFinanceColumns,agents),agentSection('Commission performance',agentCommissionColumns,agents));
 }
 if(type==='INDIVIDUAL'){
  sections.push({title:'Actual receipts in period',headers:['Date','Payment ID','Receipt','Project','Property','Purpose','Amount PHP'],rows:(data.receiptDetails||[]).map(r=>[r.date,r.paymentId,r.receiptNumber,r.project,r.property,status(r.type),php(r.amountCents)])});
  sections.push({title:'Approved calendar targets',headers:['Period','Active','Target PHP','Actual PHP','Target units','Actual weighted units','Value achievement','Unit achievement','Cutoff'],rows:(data.performance?.targets||[]).filter(r=>r.scope==='AGENT').map(r=>[r.period,r.active?'Yes':'No',php(r.valueCents),php(r.actualValueCents),r.units,r.actualUnitBps/10000,r.valueAchievement==null?'N/A':(r.valueAchievement*100).toFixed(2)+'%',r.unitAchievement==null?'N/A':(r.unitAchievement*100).toFixed(2)+'%',r.cutoff])});
  sections.push({title:'Actual commission releases in period',headers:['Contract','Commission ID','Payout ID','Release date','Amount PHP','Method','Reference'],rows:(data.commissionReleaseDetails||[]).map(r=>[r.contractId,r.commissionId,r.payoutId,r.date,php(r.amountCents),r.method,r.reference])},{title:'Commission adjustment events in period',headers:['Contract','Commission ID','Event ID','Date','Action','Previous earned PHP','Updated earned PHP','Recovery due PHP','Reason'],rows:(data.commissionAdjustmentDetails||[]).map(r=>[r.contractId,r.commissionId,r.eventId,r.date,status(r.action),php(r.previousEarnedCents),php(r.updatedEarnedCents),php(r.recoveryDueCents),r.reason])});
 }
 if(type==='AGENTS'||type==='INDIVIDUAL')summary.push(['Approved credited bookings PHP',php((data.performance?.leaderboard||[]).reduce((n,r)=>n+r.valueCents,0))],['Approved weighted units',(data.performance?.leaderboard||[]).reduce((n,r)=>n+r.unitBps,0)/10000],['Unverified bookings',data.performance?.unverifiedBookingCount??0],['Cumulative earned commissions PHP',php(s.earnedCents)],['Cumulative released commissions PHP',php(s.releasedCents)],['Earned unreleased commissions PHP',php(s.unreleasedCents)],['Releasable commissions PHP',php(s.releasableCents)],['Period commission earnings PHP',php(s.periodEarnedCents)],['Period commission releases PHP',php(s.periodReleasedCents)]);
 if(type!=='SUMMARY')sections.push({title:'Unique selected-scope totals — not sum of associated agent rows',headers:['Measure','Value'],rows:summary});
 if(data.warnings?.length)sections.push({title:'Review warnings',headers:['Warning'],rows:data.warnings.map(w=>[w])});
 return {title:SALES_REPORT_TITLES[type],sections,scope:data.scope+' Associated amounts may overlap for shared agents. Only approved weighted sales are additive across agents. Receipts are selected-period actual payments; principal satisfied may contain noncash credits. Register rows include current valid accounts and period activity, not just new bookings.'};
}
