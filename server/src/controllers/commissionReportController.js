import PropertyAssignment from "../models/PropertyAssignment.js";
import {commissionPipeline} from "./commissionController.js";
import {effectivePayout} from "../utils/commissionLedger.js";
const fail=m=>{throw Object.assign(new Error(m),{statusCode:400})};
const headers=["Commission ID","Agent ID","Agent","Project","Property","Client","Type","Period","Agent %","Budget PHP","Earned PHP","Released PHP","Unreleased PHP","Awaiting PHP","Recovery PHP","Status","Last Release"];
const amount=n=>((n||0)/100).toFixed(2);
const name=c=>[c?.firstName,c?.lastName].filter(Boolean).join(" ");
const lot=p=>`Phase ${p?.phaseNumber} / Block ${p?.blockNumber} / Lot ${p?.lotNumber}`;
export async function exportCommissions(req,res,next){try{
 const report=req.query.report||"DETAIL",format=req.query.format||"xlsx";
 if(!["DETAIL","AGENT","PROJECT","PROPERTY","DP","MONTHLY","RELEASED","UNRELEASED","PAYOUTS","ADJUSTMENTS"].includes(report)||!["xlsx","pdf"].includes(format))fail("Choose a valid commission report and export format.");
 const query={...req.query,...(["DP","MONTHLY"].includes(report)?{type:report}:report==="RELEASED"?{status:"RELEASED"}:report==="UNRELEASED"?{status:"UNRELEASED"}:{})};
 // Payout/adjustment ranges apply to their own event dates, not earning dates.
 const eventFrom=query.from,eventTo=query.to;if(["PAYOUTS","ADJUSTMENTS"].includes(report)){delete query.from;delete query.to;if(eventFrom||eventTo){if(!/^\d{4}-\d{2}-\d{2}$/.test(eventFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(eventTo)||eventFrom>eventTo)fail("Choose valid report date bounds.")}}
 const records=await PropertyAssignment.aggregate([...commissionPipeline(query),{$sort:{"agentInfo.fullName":1,"projectInfo.projectName":1,accountId:1,agent:1,period:1,commissionId:1}}]);
 let columns=headers,rows=records.map(r=>[r.commissionId,r.agentInfo?.agentId,r.agentInfo?.fullName,r.projectInfo?.projectName,lot(r.propertyInfo),name(r.clientInfo),r.type,r.period,amount(r.percentageBps),amount(r.budgetCents),amount(r.earnedCents),amount(r.releasedCents),amount(r.unreleasedCents),amount(r.awaitingCents),amount(r.recoveryDueCents),r.status,r.latestReleaseDate||""]);
 if(["AGENT","PROJECT","PROPERTY"].includes(report)){
  const groups=new Map();for(const r of records){const key=report==="AGENT"?r.agent:report==="PROJECT"?String(r.project):String(r.property);const g=groups.get(key)||{name:report==="AGENT"?`${r.agentInfo?.agentId} ${r.agentInfo?.fullName}`:report==="PROJECT"?r.projectInfo?.projectName:`${r.projectInfo?.projectName} ${lot(r.propertyInfo)}`,budget:0,earned:0,released:0,unreleased:0,awaiting:0,recovery:0};for(const k of ["budget","earned","released","unreleased","awaiting"])g[k]+=r[`${k}Cents`]||0;g.recovery+=r.recoveryDueCents;groups.set(key,g)}columns=[report,"Budget PHP","Earned PHP","Released PHP","Unreleased PHP","Awaiting PHP","Recovery PHP"];rows=[...groups.values()].map(g=>[g.name,...[g.budget,g.earned,g.released,g.unreleased,g.awaiting,g.recovery].map(amount)]);
 }
 if(["PAYOUTS","ADJUSTMENTS"].includes(report)){
  const accounts=await PropertyAssignment.find({_id:{$in:[...new Set(records.map(r=>String(r.accountId)))]}}).lean(),recordMap=new Map(records.map(r=>[r.commissionId,r]));rows=[];
  columns=report==="PAYOUTS"?["Payout ID","Commission ID","Agent","Project","Property","Actual Release Date","Amount PHP","Method","Reference","Released By","Revision Count"]:["Event ID","Commission ID","Agent","Project","Timestamp","Action","Previous Earned PHP","Updated Earned PHP","Recovery PHP","Reason"];
  for(const a of accounts)for(const raw of report==="PAYOUTS"?a.commissionPayouts||[]:a.commissionEvents||[]){const r=recordMap.get(raw.commissionId);if(!r)continue;const p=report==="PAYOUTS"?effectivePayout(raw):raw,date=report==="PAYOUTS"?p.releaseDate:new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(p.timestamp));if(eventFrom&&(date<eventFrom||date>eventTo))continue;
   if(report==="PAYOUTS")rows.push([p.payoutId,p.commissionId,r.agentInfo?.fullName,r.projectInfo?.projectName,lot(r.propertyInfo),date,amount(p.amountCents),p.method,p.reference,p.username,p.revisions?.length||0]);
   else if(!["COMMISSION_CREATED","COMMISSION_RELEASE_RECORDED"].includes(p.action))rows.push([p.eventId,p.commissionId,r.agentInfo?.fullName,r.projectInfo?.projectName,date,p.action,amount(p.previousValues?.earnedCents),amount(p.updatedValues?.earnedCents),amount(p.updatedValues?.recoveryDueCents),p.reason]);
  }
  rows.sort((a,b)=>String(a[report==="PAYOUTS"?5:4]).localeCompare(String(b[report==="PAYOUTS"?5:4]))||String(a[0]).localeCompare(String(b[0])));
 }
 if(format==="xlsx"){
  const {default:ExcelJS}=await import("exceljs");const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet("Commissions");sheet.addRow(columns);for(const row of rows)sheet.addRow(row.map((v,i)=>columns[i].includes("PHP")?Number(v):v));sheet.getRow(1).font={bold:true};sheet.columns.forEach((c,i)=>{c.width=24;if(columns[i].includes("PHP"))c.numFmt="#,##0.00"});res.type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");res.attachment(`commission-${report.toLowerCase()}.xlsx`);res.send(Buffer.from(await wb.xlsx.writeBuffer()));
 }else{
  const {default:PDFDocument}=await import("pdfkit");const doc=new PDFDocument({size:"A4",layout:"landscape",margin:32});res.type("application/pdf");res.attachment(`commission-${report.toLowerCase()}.pdf`);doc.pipe(res);doc.fontSize(16).text(`Commission ${report.toLowerCase()} report`);doc.fontSize(9).text(`Generated ${new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",dateStyle:"medium",timeStyle:"short"}).format(new Date())+" PHT"} | ${rows.length} records. Amounts in PHP.`);doc.moveDown();
  // One complete record per block avoids clipping a wide financial table.
  for(const row of rows){if(doc.y>480)doc.addPage();const text=columns.map((label,i)=>`${label}: ${row[i]??"—"}`).join("  |  ");doc.fontSize(9).text(text,{width:doc.page.width-64});doc.moveDown();}doc.end();
 }
}catch(e){next(e)}}
