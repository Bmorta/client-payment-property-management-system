import ExcelJS from "exceljs";
import {allocatePayments,effectivePayment} from "./paymentLedger.js";
import {calculateCommissions} from "./commissionLedger.js";

export const registerColumns=["No.","Date","Buyer's Name","Project Name","# Lots","Phase","Block","Lot","Price / sqm","Sqm","TCP","Term (months)","Monthly Installment","Amount Paid","Penalty Paid","Fully Covered Installments","Covered Payment / Allocation","Previous Payment Date","Due Day","Down Payment Collected","Original TCP","Assigned Agent %","Commission Periods Funded","Commission Term","Earned Commission","Net after Earned Commission","Account ID","Payment ID","Receipt Number","Project ID"];
export function registerRows(accounts,from,to){
 const rows=[];
 for(const account of accounts){
  const ledger=allocatePayments(account,to),commissions=calculateCommissions(account,ledger,{asOf:to});
  const payments=(account.payments||[]).map(effectivePayment).filter(p=>p.amountCents>0&&!p.cancelled&&!p.voided&&!["CANCELLED","VOIDED"].includes(p.status)&&p.paymentDate<=to).sort((a,b)=>a.paymentDate.localeCompare(b.paymentDate)||new Date(a.createdAt||0)-new Date(b.createdAt||0)||a.paymentId.localeCompare(b.paymentId));
  for(const [index,payment] of payments.entries()){
   if(payment.paymentDate<from)continue;
   const allocations=ledger.allocations[payment.paymentId]||[],principal=allocations.filter(a=>a.installment>0&&a.allocationType!=="PENALTY"),penalty=allocations.filter(a=>a.allocationType==="PENALTY").reduce((n,a)=>n+a.amountCents,0),dp=allocations.filter(a=>a.allocationType==="DOWN_PAYMENT").reduce((n,a)=>n+a.amountCents,0);
   const funded=commissions.records.filter(r=>r.sourceAllocations?.some(a=>a.paymentId===payment.paymentId));
   const earned=funded.reduce((n,r)=>n+r.sourceAllocations.filter(a=>a.paymentId===payment.paymentId).reduce((s,a)=>s+a.commissionCents,0),0);
   // Determine completion at this transaction, rather than from the final balance.
   const priorIds=new Set(payments.slice(0,index+1).map(p=>p.paymentId));
   const installments=[...new Set(principal.map(a=>a.installment))];
   const fully=installments.filter(i=>{const scheduled=account.contract.schedule.find(s=>s.installment===i);const allocated=Object.entries(ledger.allocations).filter(([id])=>priorIds.has(id)).flatMap(([,a])=>a).filter(a=>a.installment===i&&a.allocationType!=="PENALTY").reduce((n,a)=>n+a.amountCents,0);return scheduled&&allocated>=scheduled.amountCents}).length;
   const c=account.contract,client=account.client||{},property=account.property||{};
   rows.push([0,payment.paymentDate,[client.lastName, [client.firstName,client.middleName,client.suffix].filter(Boolean).join(" ")].filter(Boolean).join(", "),account.project?.projectName||"",1,property.phaseNumber,property.blockNumber,property.lotNumber,c.pricePerSqm??null,c.areaSqm??property.areaSqm??null,c.totalCents/100,c.months,(c.monthlyInstallmentCents??c.schedule.find(s=>s.installment>0)?.amountCents??0)/100,payment.amountCents/100,penalty/100,fully,allocations.map(a=>`${a.allocationType}: ${a.dueDate||a.installmentId} PHP ${(a.amountCents/100).toFixed(2)}`).join("; "),payments[index-1]?.paymentDate||"",c.monitoringTerms?.dueDay??"",dp/100,(account.agreementHistory?.[0]?.contract?.totalCents??c.totalCents)/100,account.commissionAgreement?account.commissionAgreement.agents.reduce((n,a)=>n+a.percentageBps,0)/10000:null,[...new Set(funded.map(r=>`${r.agentId}: ${r.type} ${r.period}`))].join("; "),account.commissionAgreement?.termMonths??null,earned/100,(payment.amountCents-earned)/100,account.assignmentId,payment.paymentId,payment.receiptNumber||"",account.project?.projectId||""]);
  }
 }
 return rows.sort((a,b)=>a[1].localeCompare(b[1])||a[2].localeCompare(b[2])||a[27].localeCompare(b[27])).map((r,i)=>[i+1,...r.slice(1)]);
}
export function paymentRegisterWorkbook(accounts,from,to){
 const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet("Payment Records");
 sheet.mergeCells(1,1,1,20);sheet.getCell(1,1).value=`PAYMENT RECORDS: ${from} to ${to}`;
 sheet.mergeCells(1,21,1,30);sheet.getCell(1,21).value="COMMISSIONS / REFERENCES";
 sheet.addRow(registerColumns);registerRows(accounts,from,to).forEach(r=>sheet.addRow(r));
 sheet.columns.forEach((column,i)=>{column.width=[2,3,16,22].includes(i)?32:18;if([8,10,12,13,14,19,20,24,25].includes(i))column.numFmt='#,##0.00;[Red](#,##0.00)';if(i===21)column.numFmt="0.00%"});
 for(const row of [sheet.getRow(1),sheet.getRow(2)]){row.height=40;row.eachCell(cell=>{cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:row.number===1?"FF244B75":"FFFFDF6B"}};cell.font={bold:true,color:{argb:row.number===1?"FFFFFFFF":"FF172B4D"}};cell.alignment={vertical:"middle",wrapText:true}})}
 sheet.views=[{state:"frozen",ySplit:2,xSplit:3}];sheet.autoFilter={from:{row:2,column:1},to:{row:Math.max(2,sheet.rowCount),column:30}};sheet.pageSetup={orientation:"landscape",paperSize:8,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:"1:2"};
 const notes=workbook.addWorksheet("Read Me");
 ["One row per effective buyer payment per property contract. Voided payments are excluded; corrections use their current effective values.","Amounts are PHP. Amount Paid includes principal and penalties; Down Payment Collected is separate from monthly allocations.","Fully Covered Installments counts installment periods completed by this payment, including prior partial payments. Allocation details show actual amounts and due dates; partial periods are not counted as full months.","Earned Commission uses the existing commission engine and actual payment allocation sources. It is not a payout. Net after Earned Commission is collections less earned commissions, not net cash after payouts or expenses.","Assigned Agent % is the sum of assigned agent percentages. Commission periods identify each agent and funding period; buyer and commission terms may differ.","Previous Payment Date is the preceding effective transaction on this contract. Due Day is the configured contractual due day; the sample's ambiguous COUNT column is labeled explicitly here.","Contract and commission terms reflect the current stored agreements. This is a current restatement, not a historical agreement-version snapshot. Original TCP uses the stored initial agreement where available; repeated contract prices must not be totaled.","Use the existing Commission Payout History report for actual release dates and paid-out commissions."].forEach(s=>notes.addRow([s]));notes.getColumn(1).width=130;notes.eachRow(r=>{r.height=45;r.alignment={wrapText:true,vertical:"middle"}});
 return workbook;
}
