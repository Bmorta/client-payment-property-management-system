import {isPosted} from "./financialReporting.js";
import ExcelJS from 'exceljs';
import {allocatePayments,effectivePayment} from './paymentLedger.js';
import {calculateCommissions} from './commissionLedger.js';
import {contractAmounts} from '../../../shared/contractPrice.js';
import {brandExcel} from '../services/companyBranding.js';
export const registerColumns=['No.','Payment Date',"Buyer's Name",'Project Name','# Lots','Phase','Block','Lot','Price / sqm','Sqm','TCP After Down Payment','Term (months)','Monthly Installment','Amount Paid','Penalty Paid','Fully Covered Installments','Covered Payment / Allocation','Previous Payment Date','Payment Count','Due Day','Down Payment Collected','Original TCP','Assigned Agent %','Commission Periods Funded','Commission Term','Earned Commission','Net after Earned Commission','Account ID','Payment ID','Receipt Number','Project ID','Agent','Released Commission','Unreleased Commission','Commission Status','Commission Recovery Due'];
export const ordinal=n=>`${n}${n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th'}`;
export function paymentCount(allocations){
 const nums=[...new Set(allocations.filter(a=>a.installment>0&&['INSTALLMENT','ADVANCE'].includes(a.allocationType)).map(a=>a.installment))].sort((a,b)=>a-b),labels=[];
 if(allocations.some(a=>a.allocationType==='DOWN_PAYMENT'))labels.push('Down Payment');
 for(let i=0;i<nums.length;i++){let end=i;while(nums[end+1]===nums[end]+1)end++;labels.push(end===i?ordinal(nums[i]):`${ordinal(nums[i])}–${ordinal(nums[end])}`);i=end}
 return labels.join('; ')||(allocations.some(a=>a.allocationType==='PENALTY')?'— (Penalty only)':allocations.some(a=>a.allocationType==='OTHER_CHARGE')?'— (Other charge)':'—');
}
function shares(records){
 const map=new Map();
 for(const r of records){let release=Math.max(0,r.netReleasedCents??r.releasedCents??0);const sources=(r.sourceAllocations||[]).filter(s=>s.commissionCents>0).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.paymentId.localeCompare(b.paymentId));
  for(const [index,s]of sources.entries()){
   const released=index===sources.length-1?release:Math.min(release,s.commissionCents);release-=released;
   const entries=map.get(s.paymentId)||[];entries.push({record:r,earned:s.commissionCents,released,unreleased:Math.max(0,s.commissionCents-released),recovery:Math.max(0,released-s.commissionCents)});map.set(s.paymentId,entries);
  }
 }
 return map;
}
export function registerData(accounts,from,to,{agents={}}={}){
 const ledgerSummary={earnedCents:0,releasedCents:0,unreleasedCents:0,recoveryCents:0};const rows=[],commissionRows=[],summary={paymentCents:0,earnedCents:0,releasedCents:0,unreleasedCents:0,recoveryCents:0};
 for(const account of accounts){
  const effectiveAccount={...account,payments:(account.payments||[]).filter(isPosted)},amounts=contractAmounts(account.contract),ledger=allocatePayments(effectiveAccount,to),commissions=calculateCommissions(effectiveAccount,ledger,{asOf:to}),byPayment=shares(commissions.records);
  const payments=effectiveAccount.payments.map(effectivePayment).filter(p=>p.amountCents>0&&!p.cancelled&&!p.voided&&!['CANCELLED','VOIDED','REVERSED'].includes(p.status)&&p.paymentDate<=to).sort((a,b)=>a.paymentDate.localeCompare(b.paymentDate)||new Date(a.createdAt||0)-new Date(b.createdAt||0)||a.paymentId.localeCompare(b.paymentId));
  for(const [index,payment] of payments.entries()){
   if(payment.paymentDate<from)continue;
   const allocations=ledger.allocations[payment.paymentId]||[],principal=allocations.filter(a=>a.installment>0&&a.allocationType!=='PENALTY'),penalty=allocations.filter(a=>a.allocationType==='PENALTY').reduce((n,a)=>n+a.amountCents,0),dp=allocations.filter(a=>a.allocationType==='DOWN_PAYMENT').reduce((n,a)=>n+a.amountCents,0),funded=commissions.records.filter(r=>r.sourceAllocations?.some(a=>a.paymentId===payment.paymentId)),parts=byPayment.get(payment.paymentId)||[];
   const sum=k=>parts.reduce((n,p)=>n+p[k],0),earned=sum('earned'),released=sum('released'),unreleased=sum('unreleased'),recovery=sum('recovery');
   for(const [key,value]of Object.entries({paymentCents:payment.amountCents,earnedCents:earned,releasedCents:released,unreleasedCents:unreleased,recoveryCents:recovery})){summary[key]+=value;if(!Number.isSafeInteger(summary[key]))throw Object.assign(new Error('Register totals exceed centavo precision.'),{statusCode:409});}
   const priorIds=new Set(payments.slice(0,index+1).map(p=>p.paymentId)),installments=[...new Set(principal.map(a=>a.installment))];
   const fully=installments.filter(i=>{const scheduled=account.contract.schedule.find(s=>s.installment===i),allocated=Object.entries(ledger.allocations).filter(([id])=>priorIds.has(id)).flatMap(([,a])=>a).filter(a=>a.installment===i&&a.allocationType!=='PENALTY').reduce((n,a)=>n+a.amountCents,0);return scheduled&&allocated>=scheduled.amountCents}).length;
   const c=account.contract,client=account.client||{},property=account.property||{},assigned=account.commissionAgreement?.agents||[],agentNames=assigned.map(a=>`${a.agentId||a.agent}: ${agents[String(a.agent)]||a.agentId||a.agent}`).join('; ');
   const status=!assigned.length?'No Commission Agreement':!allocations.some(a=>['DOWN_PAYMENT','INSTALLMENT','ADVANCE'].includes(a.allocationType))?'Not Commissionable':recovery?'Adjusted / Recovery Required':earned===0?'Awaiting Buyer Payment':unreleased===0?'Released':released>0?'Partially Released':'Unreleased – Ready for Release';
   rows.push([0,payment.paymentDate,[client.lastName,[client.firstName,client.middleName,client.suffix].filter(Boolean).join(' ')].filter(Boolean).join(', '),account.project?.projectName||'',1,property.phaseNumber,property.blockNumber,property.lotNumber,c.pricePerSqm??null,c.areaSqm??property.areaSqm??null,amounts.tcpAfterDownPaymentCents/100,c.months,(c.monthlyInstallmentCents??c.schedule.find(s=>s.installment>0)?.amountCents??0)/100,payment.amountCents/100,penalty/100,fully,allocations.map(a=>`${a.allocationType}: ${a.dueDate||a.installmentId||''} PHP ${(a.amountCents/100).toFixed(2)}`).join('; '),payments[index-1]?.paymentDate||'',paymentCount(allocations),c.monitoringTerms?.dueDay??'',dp/100,amounts.originalTcpCents/100,assigned.length?assigned.reduce((n,a)=>n+a.percentageBps,0)/10000:null,[...new Set(funded.map(r=>`${r.agentId}: ${r.type} ${r.period}`))].join('; '),account.commissionAgreement?.termMonths??null,earned/100,(payment.amountCents-earned)/100,account.assignmentId,payment.paymentId,payment.receiptNumber||'',account.project?.projectId||'',agentNames,released/100,unreleased/100,status,recovery/100]);
  }
  // One row per commission agreement/agent/period: no repeated payouts when
  // several partial buyer payments fund the same commission record.
  if((account.payments||[]).map(effectivePayment).some(p=>p.paymentDate>=from&&p.paymentDate<=to))for(const r of commissions.records){for(const [key,value]of Object.entries({earnedCents:r.earnedCents,releasedCents:r.netReleasedCents,unreleasedCents:r.unreleasedCents,recoveryCents:r.recoveryDueCents})){ledgerSummary[key]+=value;if(!Number.isSafeInteger(ledgerSummary[key]))throw Object.assign(new Error('Commission ledger totals exceed centavo precision.'),{statusCode:409});}commissionRows.push([account.assignmentId,r.commissionId,r.agentId,agents[String(r.agent)]||r.agentId,account.project?.projectName||'',r.type,r.period,r.percentageBps/100,r.budgetCents/100,r.earnedCents/100,r.releasedCents/100,r.recoveredCents/100,r.netReleasedCents/100,r.unreleasedCents/100,r.recoveryDueCents/100,r.status,r.latestReleaseDate||'']);}
 }
 rows.sort((a,b)=>a[1].localeCompare(b[1])||a[2].localeCompare(b[2])||a[28].localeCompare(b[28]));rows.forEach((r,i)=>r[0]=i+1);
 return {headers:registerColumns,rows,count:rows.length,commissionRows,summary,ledgerSummary};
}
export const registerRows=(accounts,from,to,options)=>registerData(accounts,from,to,options).rows;
export function paymentRegisterWorkbook(accounts,from,to,options={}){
 const {rows,commissionRows,summary,ledgerSummary}=registerData(accounts,from,to,options),workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Payment Records');
 sheet.mergeCells(1,1,1,20);sheet.getCell(1,1).value=`${options.companyName||'Payment–Commission Register'}: ${from} to ${to}`;sheet.mergeCells(1,21,1,registerColumns.length);sheet.getCell(1,21).value='COMMISSIONS / REFERENCES';sheet.addRow(registerColumns);
 for(const row of rows)sheet.addRow(row.map((value,i)=>['Payment Date','Previous Payment Date'].includes(registerColumns[i])&&value?new Date(`${value}T00:00:00Z`):value));
 sheet.columns.forEach((column,i)=>{const h=registerColumns[i];column.width=[2,3,16,23,31,34].includes(i)?34:20;if(['Price / sqm','TCP After Down Payment','Monthly Installment','Amount Paid','Penalty Paid','Down Payment Collected','Original TCP','Earned Commission','Net after Earned Commission','Released Commission','Unreleased Commission','Commission Recovery Due'].includes(h))column.numFmt='"₱"#,##0.00;[Red]("₱"#,##0.00)';if(h==='Assigned Agent %')column.numFmt='0.00%';if(['Payment Date','Previous Payment Date'].includes(h))column.numFmt='mmm d, yyyy'});
 for(const row of [sheet.getRow(1),sheet.getRow(2)]){row.height=44;row.eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:row.number===1?'FF244B75':'FFFFDF6B'}};cell.font={bold:true,color:{argb:row.number===1?'FFFFFFFF':'FF172B4D'}};cell.alignment={vertical:'middle',wrapText:true}})}
 sheet.eachRow((row,n)=>{if(n>2){row.alignment={wrapText:true,vertical:'top'};row.height=45}});sheet.views=[{state:'frozen',ySplit:2,xSplit:3}];sheet.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,sheet.rowCount),column:registerColumns.length}};sheet.pageSetup={orientation:'landscape',paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:2'};brandExcel(workbook,sheet,options);
 const totals=workbook.addWorksheet('Totals');totals.addRow(['Scope','All matching effective buyer payments across all pages']);for(const [label,value]of Object.entries(summary))totals.addRow([label,value/100]);totals.addRow(['Agent ledger position as of report end (matching accounts)']);for(const [label,value]of Object.entries(ledgerSummary))totals.addRow([label,value/100]);totals.getColumn(1).width=42;totals.getColumn(2).width=30;totals.getColumn(2).numFmt='"₱"#,##0.00';
 const detail=workbook.addWorksheet('Agent Commission Ledger');detail.addRow(['Account','Commission ID','Agent ID','Agent','Project','Type','Period','Agent %','Budget PHP','Earned PHP','Released Gross PHP','Recovered PHP','Released Net PHP','Unreleased PHP','Recovery Due PHP','Status','Latest Release Date']);commissionRows.forEach(r=>detail.addRow(r));detail.columns.forEach((c,i)=>{c.width=25;if(i>=8&&i<=14)c.numFmt='"₱"#,##0.00'});detail.getRow(1).font={bold:true};detail.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,detail.rowCount),column:17}};
 const notes=workbook.addWorksheet('Read Me');[
 'One row per effective buyer payment. Cancelled/voided payments are excluded; corrections use effective values. Payment Amount is never repeated per assigned agent.',
 'Payment Count comes from actual principal installment allocations: partial receipts retain the same ordinal; advances list a range; DP is separate.',
 'Original TCP is the current authorized selling price before agreed DP. TCP After Down Payment = Original TCP minus agreed DP. Neither is the current outstanding balance. Repeated contract prices must not be totaled.',
 'Earned Commission uses the full assigned agreement percentages and the existing fixed, completed-installment engine. Incomplete monthly periods earn no additional monthly commission. DP is separate. Payout status never reduces the earning rate.',
 'Payouts attach to commission periods, not individual buyer receipts. Released amounts are attributed to positive earning sources in chronological order for display only; no payment or payout records are modified. The Agent Commission Ledger shows the actual gross releases, recoveries and balances once per agreement/agent/period.',
 'Unreleased is earned less attributed net releases, floored at zero; excess is Recovery Due. Reversals with no surviving earning source remain visible in the separate agent ledger. Ledger balances are the position as of report end for accounts with matching buyer payments; they are not new payout movements in the date range.',
 'Terms reflect current stored agreements (a restatement), not a reconstruction of old agreement versions. Exported company branding is a versioned snapshot; future company edits do not rewrite this downloaded workbook.'
 ].forEach(s=>notes.addRow([s]));notes.getColumn(1).width=130;notes.eachRow(r=>{r.height=48;r.alignment={wrapText:true,vertical:'middle'}});return workbook;
}
