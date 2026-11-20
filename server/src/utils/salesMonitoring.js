import {summarizeAccount,validDate} from './accounting.js';
import {calculateCommissions,effectivePayout} from './commissionLedger.js';
import {recordId,recordedSaleAccount,validSaleAccount,originalContract,saleInventoryStatus,attributedSaleAgents} from './salesClassification.js';
import {isPosted,financialRows} from './financialReporting.js';
import {buildSalesPerformance} from './salesPerformance.js';

const pht=value=>{const date=new Date(value);return value&&Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(date):''};
const amount=value=>Number.isSafeInteger(value)&&value>=0?value:null;
const inRange=(day,from,to)=>validDate(day)&&day>=from&&day<=to;
const sum=(rows,key)=>{const value=rows.reduce((n,r)=>n+(r[key]??0),0);if(!Number.isSafeInteger(value))throw Object.assign(new Error('Sales total exceeds supported centavo precision.'),{statusCode:409});return value};
const initialContract=originalContract;
const contractType=(a,hold)=>a.reactivationIn?'REACTIVATION':a.transferIn?'TRANSFER':a.assumptionIn?'ASSUMPTION':hold?'RESERVATION':'DIRECT';
const reservationState=(r,today)=>r.status==='ACTIVE'&&r.expiresOn<today?'EXPIRED':r.status;
const name=person=>[person?.firstName,person?.middleName,person?.lastName,person?.suffix].filter(Boolean).join(' ');
const conversions=r=>pht(r.history?.find(h=>h.action==='CONVERTED')?.timestamp);

// A movement is never another cash receipt. Missing legacy dates/values are
// explicitly surfaced; no invented effective dates or reconstructed ledger writes.
export function saleMovements(account,hold){
 const a=account,events=[],warnings=[],initial=initialContract(a),type=contractType(a,hold);
 const start=a.transferIn?.effectiveDate||a.assumptionIn?.effectiveDate||a.reactivationIn?.effectiveDate||initial?.contractDate;
 const corrections=(a.financialCorrections||[]).slice().sort((x,y)=>String(x.effectiveDate).localeCompare(String(y.effectiveDate)));
 const priceAt=date=>{let price=amount(initial?.totalCents);for(const c of corrections)if(c.effectiveDate<=date)price=amount(c.correctedContract?.totalCents);return price};
 const add=(date,kind,value,sign=1)=>{if(!validDate(date)||value===null){warnings.push(`${a.assignmentId}: ${kind} missing verified date or amount`);return}events.push({date,kind,amountCents:value*sign})};
 add(start,type==='DIRECT'||type==='RESERVATION'?'ORIGINAL_SALE':'REPLACEMENT_IN',amount(initial?.totalCents));
 for(const c of corrections){const old=amount(c.currentContract?.totalCents),next=amount(c.correctedContract?.totalCents);add(c.effectiveDate,'PRICE_CORRECTION',old===null||next===null?null:Math.abs(next-old),next<old?-1:1)}
 for(const [kind,closure] of [['CANCELLED',a.cancellationOut],['TRANSFER_OUT',a.transferOut],['ASSUMPTION_OUT',a.assumptionOut]])if(closure)add(closure.effectiveDate,kind,priceAt(closure.effectiveDate),-1);
 for(const p of a.forfeiturePeriods||[]){add(p.effectiveDate,'FORFEITED',amount(p.beforeContract?.totalCents)??priceAt(p.effectiveDate),-1);if(p.reactivatedAt&&!p.replacementId)add(p.reactivatedAt,'REACTIVATED',priceAt(p.reactivatedAt))}
 if(a.lifecycle==='CANCELLED'&&!a.cancellationOut||a.lifecycle==='TRANSFERRED'&&!a.transferOut||a.lifecycle==='ASSUMED'&&!a.assumptionOut||['FORFEITED','SUPERSEDED'].includes(a.lifecycle)&&!a.forfeiturePeriods?.length||['CANCELLED','FORFEITED','TRANSFERRED','ASSUMED'].includes(a.migration?.historicalStatus)&&!a.cancellationOut&&!a.transferOut&&!a.assumptionOut&&!a.forfeiturePeriods?.length)warnings.push(`${a.assignmentId}: closed historical contract has no verified movement date`);
 if(!corrections.length&&amount(initial?.totalCents)!==amount(a.contract?.totalCents))warnings.push(`${a.assignmentId}: contract value changed without a dated price correction`);
 return {events,warnings};
}
export function salesMonitoring({accounts=[],properties=[],projects=[],agents=[],reservations=[],clients=[],collections=null,planningTargets=[],from,to,today,planningYear=to?.slice(0,4),project='',agent='',type='',status=''}){
 const warnings=[],allAccounts=accounts.filter(recordedSaleAccount),lots=new Map(properties.map(p=>[recordId(p),p])),projectNames=new Map(projects.map(p=>[recordId(p),p.projectName])),agentNames=new Map(agents.map(a=>[recordId(a),a.fullName]));
 const holdsByAccount=new Map(reservations.filter(r=>r.account).map(r=>[recordId(r.account),r]));
 const byLot=new Map();for(const a of allAccounts){const id=recordId(a.property);byLot.set(id,[...(byLot.get(id)||[]),a])}
 const attributed=a=>attributedSaleAgents(a,holdsByAccount.get(recordId(a)));
 const statusOf=(a,ledger)=>!validSaleAccount(a)?(a.lifecycle&&a.lifecycle!=='ACTIVE'?a.lifecycle:a.migration?.historicalStatus||'CLOSED'):a.pendingCancellation||a.lifecycle==='CANCELLATION_PENDING'?'CANCELLATION_PENDING':!ledger?'REVIEW_REQUIRED':ledger.settlement.verification?.current?'FULLY_PAID':ledger.settlement.status==='SETTLED'?'SETTLEMENT_PENDING':ledger.settlement.status==='PRINCIPAL_FULLY_PAID'?'PRINCIPAL_FULLY_PAID':ledger.settlement.status==='REVIEW_REQUIRED'?'REVIEW_REQUIRED':'INSTALLMENT';
 const eligible=allAccounts.filter(a=>(!project||recordId(a.project)===project)&&(!type||contractType(a,holdsByAccount.get(recordId(a)))===type));
 const rows=[],events=[],commissions=[],selectedAccounts=new Set(),closingRows=[];
 for(const a of eligible){
  const matchesAgent=!agent||attributed(a).includes(agent);
  const id=recordId(a),lot=lots.get(recordId(a.property)),current=validSaleAccount(a)&&a.contract?.contractDate<=today;
  const conflict=current&&(!lot||lot.reservation||byLot.get(recordId(a.property))?.filter(validSaleAccount).length!==1||lot.client&&recordId(lot.client)!==recordId(a.client)||lot.status==='AVAILABLE'&&!lot.client);
  let ledger=null;try{ledger=summarizeAccount(a,today)}catch{warnings.push(`${a.assignmentId}: account ledger needs reconciliation`)}
  const rowStatus=conflict?'REVIEW_REQUIRED':statusOf(a,ledger);
  if(status&&rowStatus!==status)continue;
  if(matchesAgent){
  selectedAccounts.add(id);
  if(conflict)warnings.push(`${a.assignmentId}: conflicting inventory/contract link; omitted from current valid sale totals`);
  const attribution=attributed(a),booking=initialContract(a),r=holdsByAccount.get(id),movement=saleMovements(a,r);
  warnings.push(...movement.warnings);
  // Historical closing balances use the contract lifecycle at the cutoff, not
  // today's property status. Missing movement evidence remains unresolved.
  const cutoffEvents=movement.events.filter(e=>e.date<=to);
  const closingValue=sum(cutoffEvents,'amountCents');
  if(movement.warnings.length||to===today&&conflict){closingRows.push({propertyId:recordId(a.property),unknown:true})}
  else if(closingValue>0){
   let closingLedger;try{closingLedger=to===today?ledger:summarizeAccount(a,to)}catch{}
   closingRows.push({propertyId:recordId(a.property),valueCents:closingValue,receivableCents:closingLedger?.balanceCents??null});
  }else if(closingValue<0){closingRows.push({propertyId:recordId(a.property),unknown:true});warnings.push(`${a.assignmentId}: negative historical contracted position; inspect movements`)}
  const row={id,contractId:a.assignmentId,clientId:recordId(a.client),client:name(a.client)||a.client?.clientId||'Client',propertyId:recordId(a.property),property:lot?.propertyId||a.property?.propertyId||recordId(a.property),projectId:recordId(a.project),project:projectNames.get(recordId(a.project))||'Unknown project',date:booking?.contractDate,type:contractType(a,r),status:rowStatus,agentIds:attribution,agents:attribution.map(x=>agentNames.get(x)||x),attribution:a.salesAttribution?.shares?.length?'Administrator-approved sales shares':r?.agent?'Recorded reservation agent':a.commissionAgreementHistory?.length?'Earliest recorded commission allocation':'Recorded commission allocation (not verified sale attribution)',salesAttribution:a.salesAttribution||null,originalSale:!a.transferIn&&!a.assumptionIn&&!a.reactivationIn,originalCents:amount(booking?.totalCents),valueCents:amount(a.contract?.totalCents),valid:current&&!conflict,principalPaidCents:ledger?.paidCents??null,receivableCents:current&&!conflict?ledger?.balanceCents??null:null};
  if(row.valid&&row.valueCents===null)warnings.push(`${a.assignmentId}: missing current contract value`);
  rows.push(row);
  for(const e of movement.events)if(inRange(e.date,from,to))events.push({...e,accountId:id,contractId:row.contractId,projectId:row.projectId,project:row.project,property:row.property,agents:row.agents,agentIds:attribution});
  }
  if(ledger)try{const records=calculateCommissions(a,ledger,{asOf:today}).records;for(const c of records){if(agent&&recordId(c.agent)!==agent)continue;commissions.push({projectId:recordId(a.project),agentId:recordId(c.agent),earnedCents:c.earnedCents,releasedCents:c.releasedCents,unreleasedCents:c.unreleasedCents,releasableCents:c.releasableCents,periodEarnedCents:sum((c.sourceAllocations||[]).filter(x=>inRange(x.effectiveDate,from,to)),'commissionCents'),periodReleasedCents:sum((a.commissionPayouts||[]).filter(x=>x.commissionId===c.commissionId&&isPosted(x)).map(effectivePayout).filter(x=>inRange(x.releaseDate,from,to)),'amountCents')})}}catch{warnings.push(`${a.assignmentId}: commission calculation requires review`)}
 }
 const scopedHolds=reservations.filter(r=>(!project||recordId(r.project)===project)&&(!agent||recordId(r.agent)===agent)&&(!type||type==='RESERVATION')&&(!status||selectedAccounts.has(recordId(r.account))));
 const holdIds=new Set(scopedHolds.map(recordId)),cohort=scopedHolds.filter(r=>inRange(r.startDate,from,to));
 const convertedCohort=cohort.filter(r=>r.status==='CONVERTED'&&validDate(conversions(r))&&conversions(r)<=today);
 const convertedPeriod=scopedHolds.filter(r=>r.status==='CONVERTED'&&inRange(conversions(r),from,to));
 for(const r of scopedHolds)if(r.status==='CONVERTED'&&!validDate(conversions(r)))warnings.push('Converted reservation '+recordId(r)+' has no recorded conversion timestamp');
 const receiptRows=(collections??financialRows(accounts,[]).collections).filter(r=>r.posted&&!r.reservationCreditId&&inRange(r.paymentDate,from,to)&&(r.reservationId?holdIds.has(recordId(r.reservationId)):selectedAccounts.has(recordId(r.accountId))));
 const valid=rows.filter(r=>r.valid),originalEvents=events.filter(e=>e.kind==='ORIGINAL_SALE'),cancelEvents=events.filter(e=>e.kind==='CANCELLED'),forfeitEvents=events.filter(e=>e.kind==='FORFEITED');
 const summary={grossSalesCents:sum(originalEvents,'amountCents'),newContracts:originalEvents.length,cancelled:cancelEvents.length,cancelledCents:-sum(cancelEvents,'amountCents'),forfeited:forfeitEvents.length,forfeitedCents:-sum(forfeitEvents,'amountCents'),netMovementCents:sum(events,'amountCents'),activeContracts:valid.length,currentValueCents:sum(valid,'valueCents'),receivableCents:sum(valid,'receivableCents'),unverifiedReceivables:valid.filter(r=>r.receivableCents===null).length,installment:valid.filter(r=>r.status==='INSTALLMENT').length,fullyPaid:valid.filter(r=>r.status==='FULLY_PAID').length,settlementPending:valid.filter(r=>['PRINCIPAL_FULLY_PAID','SETTLEMENT_PENDING'].includes(r.status)).length,collectionsCents:sum(receiptRows,'amountCents'),reservationFeesCents:sum(receiptRows.filter(r=>r.type==='RESERVATION_FEE'),'amountCents'),activeReservations:scopedHolds.filter(r=>reservationState(r,today)==='ACTIVE').length,expiredReservations:scopedHolds.filter(r=>reservationState(r,today)==='EXPIRED').length,reservationsCreated:cohort.length,reservationsConverted:convertedPeriod.length,cohortConverted:convertedCohort.length,conversionRate:cohort.length?convertedCohort.length/cohort.length:null,prospects:project||agent||type||status?null:clients.filter(c=>c.status==='PROSPECT'&&!c.deletedAt).length,...Object.fromEntries(['earnedCents','releasedCents','unreleasedCents','releasableCents','periodEarnedCents','periodReleasedCents'].map(k=>[k,sum(commissions,k)]))};
 summary.verifiedReceivableSubtotalCents=summary.receivableCents;
 if(summary.unverifiedReceivables)summary.receivableCents=null;
 const closingLots=new Set(),closingConflicts=closingRows.some(r=>{if(r.unknown||closingLots.has(r.propertyId))return true;closingLots.add(r.propertyId);return false});
 summary.closingContractValueCents=closingConflicts?null:sum(closingRows,'valueCents');
 summary.closingReceivableCents=closingConflicts||closingRows.some(r=>r.receivableCents===null)?null:sum(closingRows,'receivableCents');
 if(closingConflicts)warnings.push('Historical closing contract totals unavailable: incomplete movement evidence or overlapping contracts at cutoff.');
 else if(summary.closingReceivableCents===null)warnings.push('Historical closing receivables unavailable: at least one account ledger needs reconciliation.');
 const matchingLotIds=new Set([...rows.map(r=>r.propertyId),...scopedHolds.map(r=>recordId(r.property))]);
 const rowLotIds=new Set(rows.map(r=>r.propertyId));
 const inventoryScope=properties.filter(p=>(!project||recordId(p.project)===project)&&(!agent||matchingLotIds.has(recordId(p)))&&(!type&&!status||rowLotIds.has(recordId(p))));
 summary.available=inventoryScope.filter(p=>saleInventoryStatus(p,byLot.get(recordId(p)),projects.find(x=>recordId(x)===recordId(p.project))?.status)==='AVAILABLE').length;
 const validLotIds=new Set(valid.map(r=>r.propertyId));
 summary.sold=inventoryScope.filter(p=>validLotIds.has(recordId(p))&&saleInventoryStatus(p,byLot.get(recordId(p)),projects.find(x=>recordId(x)===recordId(p.project))?.status)==='SOLD').length;
 for(const p of inventoryScope)if(['SOLD','FOR_ASSUME'].includes(p.status)&&!(byLot.get(recordId(p))||[]).some(validSaleAccount))warnings.push((p.propertyId||recordId(p))+': saved sold/for-assume status has no valid contract');
 const months=new Map();for(let day=from.slice(0,7)+'-01';day<=to;){months.set(day.slice(0,7),{month:day.slice(0,7),grossSalesCents:0,netMovementCents:0,collectionsCents:0,cancelled:0,forfeited:0});const next=new Date(day+'T00:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);day=next.toISOString().slice(0,10)}
 for(const e of events){const m=months.get(e.date.slice(0,7));m.netMovementCents+=e.amountCents;if(e.kind==='ORIGINAL_SALE')m.grossSalesCents+=e.amountCents;if(e.kind==='CANCELLED')m.cancelled++;if(e.kind==='FORFEITED')m.forfeited++}
 for(const r of receiptRows)months.get(r.paymentDate.slice(0,7)).collectionsCents+=r.amountCents;
 const group=(id,label,rs,es,cs,hs)=>({id,label,newContracts:es.filter(e=>e.kind==='ORIGINAL_SALE').length,grossSalesCents:sum(es.filter(e=>e.kind==='ORIGINAL_SALE'),'amountCents'),currentValueCents:sum(rs.filter(r=>r.valid),'valueCents'),activeContracts:rs.filter(r=>r.valid).length,cancelled:es.filter(e=>e.kind==='CANCELLED').length,forfeited:es.filter(e=>e.kind==='FORFEITED').length,converted:hs.filter(r=>r.status==='CONVERTED'&&inRange(conversions(r),from,to)).length,earnedCents:sum(cs,'earnedCents'),releasedCents:sum(cs,'releasedCents'),unreleasedCents:sum(cs,'unreleasedCents')});
 const projectRows=projects.filter(p=>!project||recordId(p)===project).map(p=>group(recordId(p),p.projectName,rows.filter(r=>r.projectId===recordId(p)),events.filter(e=>e.projectId===recordId(p)),commissions.filter(c=>c.projectId===recordId(p)),scopedHolds.filter(r=>recordId(r.project)===recordId(p))));
 const agentRows=[...new Set([...rows.flatMap(r=>r.agentIds),...commissions.map(c=>c.agentId),...scopedHolds.map(r=>recordId(r.agent)).filter(Boolean)])].filter(id=>!agent||id===agent).map(id=>group(id,agentNames.get(id)||id,rows.filter(r=>r.agentIds.includes(id)),events.filter(e=>e.agentIds.includes(id)),commissions.filter(c=>c.agentId===id),scopedHolds.filter(r=>recordId(r.agent)===id)));
 const eventByAccount=new Map();for(const e of events)eventByAccount.set(e.accountId,[...(eventByAccount.get(e.accountId)||[]),e]);const receiptAccounts=new Set(receiptRows.map(p=>recordId(p.accountId)));
 const register=rows.map(r=>({...r,periodEvents:(eventByAccount.get(r.id)||[]).map(e=>e.kind),periodMovementCents:sum(eventByAccount.get(r.id)||[],'amountCents')})).filter(r=>r.periodEvents.length||r.valid||receiptAccounts.has(r.id)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||a.contractId.localeCompare(b.contractId));
 const holdsByLot=new Map();for(const hold of reservations.filter(r=>r.held===true)){const id=recordId(hold.property);holdsByLot.set(id,[...(holdsByLot.get(id)||[]),hold])}
 const sellThroughInventory={sold:0,available:0,reserved:0,excluded:0};
 for(const p of inventoryScope){const id=recordId(p),holds=holdsByLot.get(id)||[],linked=(byLot.get(id)||[]).filter(validSaleAccount),business=saleInventoryStatus(p,linked,projects.find(x=>recordId(x)===recordId(p.project))?.status);
  if(business==='SOLD'&&validLotIds.has(id)&&!holds.length&&!p.reservation)sellThroughInventory.sold++;
  else if(business==='AVAILABLE'&&!holds.length&&!p.reservation&&!linked.length)sellThroughInventory.available++;
  else if(business==='RESERVED'&&holds.length===1&&recordId(holds[0])===recordId(p.reservation)&&!linked.length)sellThroughInventory.reserved++;
  else sellThroughInventory.excluded++;
 }
 const performance=buildSalesPerformance({accounts,selectedIds:selectedAccounts,agents,projects,targets:planningTargets,from,to,today,planningYear,project,agent,type,status,inventory:sellThroughInventory});
 const receiptDetails=receiptRows.map(r=>({paymentId:r.paymentId,receiptNumber:r.receiptNumber||'',date:r.paymentDate,project:projectNames.get(recordId(r.project))||'Unknown project',property:lots.get(recordId(r.property))?.propertyId||recordId(r.property),type:r.type||'PAYMENT',amountCents:r.amountCents})).sort((a,b)=>b.date.localeCompare(a.date)||String(a.paymentId).localeCompare(String(b.paymentId)));
 const reservationDetails=scopedHolds.filter(r=>['ACTIVE','EXPIRED'].includes(reservationState(r,today))||inRange(r.startDate,from,to)||inRange(conversions(r),from,to)).map(r=>({id:recordId(r),buyer:name(r.client)||r.client?.clientId||'Buyer',project:projectNames.get(recordId(r.project))||'Unknown project',property:lots.get(recordId(r.property))?.propertyId||recordId(r.property),agent:agentNames.get(recordId(r.agent))||'',startDate:r.startDate,expiresOn:r.expiresOn,convertedOn:conversions(r),status:reservationState(r,today),feeCents:r.payment?.amountCents??null}));
 return {from,to,today,filters:{project,agent,type,status},summary,performance,months:[...months.values()],projects:projectRows,agents:agentRows,register,receiptDetails,reservationDetails,events:events.sort((a,b)=>a.date.localeCompare(b.date)||a.contractId.localeCompare(b.contractId)),warnings:[...new Set(warnings)],scope:'Period movements use contractual effective dates; receipts use actual posted payment dates; current contract balances, inventory and cumulative commissions are as of today. Closing figures use recorded lifecycle movements and account allocations at the selected end date; current-status filters still select by current status. Agent association uses approved attribution where recorded, otherwise reservation agent or earliest available commission allocation. Shared full-contract values are non-additive; advanced weighted results use approved shares only. Reservation conversion rate uses the created-period cohort through today. Missing historical evidence is flagged; net movement is not accounting profit.'};
}
