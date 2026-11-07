import {createHash} from "node:crypto";
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {loadFinancialData} from '../services/financialReportService.js';
import {dateRange,today,validDate} from '../utils/accounting.js';
import {buildCollectionReport,filterPayments,sorted,pageRows,total,parseMethods,fail} from '../utils/financialReporting.js';
import {paymentMethodLabel} from '../../../shared/paymentMethods.js';
const clientName=c=>c?[c.firstName,c.middleName,c.lastName,c.suffix].filter(Boolean).join(' '):'Unknown client';
const propertyName=p=>p?`${p.propertyId||''} Phase ${p.phaseNumber} Block ${p.blockNumber} Lot ${p.lotNumber}`:'';
const collectionHeaders=['Date','Payment ID','Receipt Number','Client','Project','Property','Mode of Payment','Amount PHP','Status'];
const expenseHeaders=['Date','Expense ID','Category','Description','Project','Mode of Payment','Amount PHP','Status'];
const methodText=r=>paymentMethodLabel(r.method)+(r.method==="OTHER"?` (${r.fundingAccount||"Unknown"} funding)`:"");
const collectionRow=p=>[p.paymentDate,p.paymentId,p.receiptNumber||'',clientName(p.client),p.project?.projectName||'',propertyName(p.property),methodText(p),p.amountCents/100,p.status];
const expenseRow=e=>[e.expenseDate,e.expenseId,e.category,e.description,e.project?.projectName||'',methodText(e),e.amountCents/100,e.status];
const snapshot=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");
function ids(query){for(const field of ['project','client'])if(query[field]&&!mongoose.isValidObjectId(query[field]))fail(`Invalid ${field}.`)}
const metadata=(data)=>[data.companyName,data.title,`${data.from} to ${data.to}`,`Methods: ${data.methods.length?data.methods.map(paymentMethodLabel).join(', '):'All payment methods'}`,`Project: ${data.project||'All'}; Collection search: ${data.collectionQuery||'All'}; Expense search: ${data.expenseQuery||'All'}`,`Generated: ${data.generatedOn} PHT`];
export async function writeFinancialExport(data,format,res){
 if(!['xlsx','pdf'].includes(format))fail('Choose Excel or PDF.');
 const summary=[['Scope',data.scope],['Total Collections PHP',data.totalCollectionsCents/100],['Total Expenses PHP',data.totalExpensesCents/100],['Net Collection PHP',data.netCollectionCents/100],['Cash scope',data.cash?.scope||'Not included'],['Cash Collections PHP',data.cash?data.cash.collectionsCents/100:'Not included'],['Cash Expenses PHP',data.cash?data.cash.expensesCents/100:'Not included'],['Opening Cash PHP',data.cash?.available?data.cash.openingCents/100:'Unavailable'],['Other Cash Inflows PHP',data.cash?data.cash.otherInflowsCents/100:'Not included'],['Bank Deposits PHP',data.cash?data.cash.bankDepositsCents/100:'Not included'],['Other Cash Outflows PHP',data.cash?data.cash.otherOutflowsCents/100:'Not included'],['Cash on Hand PHP',data.cash?.available?data.cash.closingCents/100:'Unavailable'],['Cash availability',(data.cash?.reasons||[]).join(' ')||'See cash scope'],['Accounting policy','Net collection subtracts recorded expenses. Commission payouts not linked to expenses affect physical cash separately. Deposits/withdrawals are transfers, not expenses/revenue.']];
 if(format==='xlsx'){
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Summary');metadata(data).forEach(v=>sheet.addRow([v]));summary.forEach(r=>sheet.addRow(r));sheet.getColumn(1).width=42;sheet.getColumn(2).width=90;sheet.getColumn(2).numFmt='#,##0.00';sheet.eachRow(r=>r.alignment={wrapText:true,vertical:'top'});sheet.getRow(1).font={bold:true,size:16};sheet.getRow(2).font={bold:true,size:13};sheet.getRow(sheet.rowCount).height=42;sheet.views=[{state:'frozen',ySplit:6}];sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:6'};
  const sheets=[['Payment Methods',['Method','Collections PHP','Expenses PHP','Net PHP'],[...(data.breakdown||[]).map(b=>[paymentMethodLabel(b.method),b.collectionsCents/100,b.expensesCents/100,b.netCents/100]),['Total',data.totalCollectionsCents/100,data.totalExpensesCents/100,data.netCollectionCents/100]]],['Collections',collectionHeaders,data.collections.map(collectionRow)],['Expenses',expenseHeaders,data.expenses.map(expenseRow)]];
  if(data.cash)sheets.push(['Office Cash Movements',['Date','Type','Reference','Signed Amount PHP'],data.cash.events.map(e=>[e.date,e.kind,e.reference,e.amountCents/100])]);
  for(const [name,headers,rows] of sheets){const s=book.addWorksheet(name);metadata(data).forEach(v=>s.addRow([v]));const header=s.addRow(headers);header.font={bold:true};header.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6EDF7'}});rows.forEach(r=>{const row=s.addRow(r);row.alignment={wrapText:true,vertical:'top'};row.height=Math.max(30,Math.min(120,Math.max(...r.map(v=>Math.ceil(String(v??'').length/22)))*15))});s.columns.forEach((c,i)=>{c.width=i===3?36:24;if(headers[i]?.includes('PHP'))c.numFmt='#,##0.00;[Red](#,##0.00)'});s.views=[{state:'frozen',ySplit:7}];s.autoFilter={from:{row:7,column:1},to:{row:Math.max(7,s.rowCount),column:headers.length}};s.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:7'};}
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.attachment(`collection-cash-${data.from}-${data.to}.xlsx`);return res.send(Buffer.from(await book.xlsx.writeBuffer()));
 }
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:36}),chunks=[];doc.on('data',c=>chunks.push(c));const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 const bottom=doc.page.height-40,width=doc.page.width-72;
 const line=(text,size=10)=>{doc.font('Helvetica').fontSize(size);const height=doc.heightOfString(String(text),{width});if(doc.y+height>bottom)doc.addPage();doc.text(String(text),36,doc.y,{width});};
 metadata(data).forEach((v,i)=>line(v,i<2?14:9));doc.moveDown();
 // Measure wrapped cells before drawing. Repeat column headings after page breaks.
 const table=(headers,rows,weights)=>{
  const sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(w=>width*w/sum);
  const draw=(cells,heading=false)=>{
   doc.font(heading?'Helvetica-Bold':'Helvetica').fontSize(8);
   const heights=cells.map((v,i)=>doc.heightOfString(String(v??''),{width:widths[i]-10}));
   const height=Math.max(24,...heights.map(h=>h+12));
   if(doc.y+height>bottom){doc.addPage();if(!heading)draw(headers,true);doc.font(heading?'Helvetica-Bold':'Helvetica').fontSize(8)}
   const top=doc.y;let x=36;
   cells.forEach((v,i)=>{if(heading)doc.rect(x,top,widths[i],height).fill('#e6edf7');doc.lineWidth(.4).strokeColor('#cbd5e1').rect(x,top,widths[i],height).stroke();doc.fillColor('#111827').text(String(v??''),x+5,top+6,{width:widths[i]-10});x+=widths[i]});
   doc.y=top+height;doc.x=36;
  };
  draw(headers,true);for(const row of rows)draw(row);if(!rows.length)draw(headers.map((_,i)=>i===0?'No matching records.':''));doc.moveDown();
 };
 const money=n=>n.toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
 table(['Summary','Amount / Details'],summary.map(([k,v])=>[k,typeof v==='number'?money(v):v]),[1,2]);
 if(doc.y+110>bottom)doc.addPage();line('Payment Method Breakdown',13);doc.moveDown(.4);
 table(['Payment Method','Collections PHP','Expenses PHP','Net PHP'],[...(data.breakdown||[]).map(b=>[paymentMethodLabel(b.method),money(b.collectionsCents/100),money(b.expensesCents/100),money(b.netCents/100)]),['Total',money(data.totalCollectionsCents/100),money(data.totalExpensesCents/100),money(data.netCollectionCents/100)]],[1,1,1,1]);
 for(const [name,headers,rows,weights] of [['Collections',collectionHeaders,data.collections.map(collectionRow),[1,1,1,1.4,1.2,1.5,1.1,1,.8]],['Expenses',expenseHeaders,data.expenses.map(expenseRow),[1,1,1,2,1.3,1.2,1,.8]]]){doc.addPage();line(name,14);doc.moveDown(.5);table(headers,rows.map(r=>r.map(v=>typeof v==='number'?money(v):v)),weights)}
 doc.end();const bytes=await done;res.type('application/pdf');res.attachment(`collection-cash-${data.from}-${data.to}.pdf`);res.send(bytes);
}
export async function collectionReport(req,res,next){try{
 ids(req.query);const {from,to}=dateRange(req.query),data=await loadFinancialData(to),result=buildCollectionReport(data,data.entries,{...req.query,from,to});
 result.companyName=process.env.COMPANY_NAME||'Client Payment & Property Management System';result.title='Collection & Cash Summary';result.generatedOn=today();result.collectionQuery=String(req.query.collectionQ||'');result.expenseQuery=String(req.query.expenseQ||'');
 // Current ledger as of actual records, never a cash forecast for future days.
 if(to>today()){const {cashPosition}=await import('../utils/financialReporting.js');result.cash=cashPosition(data,data.entries,from,today());result.cash.scope+=`; actual records through ${today()}, no forecast`;if(from>today()){result.cash.available=false;result.cash.closingCents=null;result.cash.openingCents=null;result.cash.reasons.push('Cash on hand cannot be calculated for a future period.')}}
 result.snapshot=snapshot({from,to,methods:result.methods,project:result.project,collections:result.collections.map(r=>[...collectionRow(r),r.fundingAccount]),expenses:result.expenses.map(r=>[...expenseRow(r),r.fundingAccount,r.commissionPayoutId,r.payoutLinkChecked]),cash:result.cash});
 if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==result.snapshot)fail('Transactions changed. Refresh the report before printing or exporting.',409);
 if(req.query.format)return await writeFinancialExport(result,req.query.format,res);
 if(req.query.all==='1')return res.json({success:true,data:result});
 res.json({success:true,data:{...result,collections:pageRows(result.collections,req.query.collectionPage||1),expenses:pageRows(result.expenses,req.query.expensePage||1)}});
}catch(e){next(e)}}
export async function transactionReport(req,res,next){try{
 if(req.query.receipt!==undefined&&(typeof req.query.receipt!=="string"||req.query.receipt.length>120))fail("Use a valid receipt-number search (up to 120 characters).");
 ids(req.query);if(req.query.status&&!["VALID","CORRECTED","VOIDED","CANCELLED","REVERSED","POSTED","DRAFT","PENDING"].includes(req.query.status))fail("Choose a valid transaction status.");const from=req.query.from||'0001-01-01',to=req.query.to||'9999-12-31';if(!validDate(from)||!validDate(to)||from>to)fail('Choose a valid transaction date range.');
 const data=await loadFinancialData(to),rows=sorted(filterPayments(data.collections,{...req.query,from,to}),req.query.sort||'date',req.query.direction||'desc'),totalCents=total(rows.filter(r=>r.posted));
 const fingerprint=snapshot(rows.map(r=>[...collectionRow(r),r.fundingAccount,r.posted]));if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==fingerprint)fail('Transactions changed. Refresh the list before printing or exporting.',409);
 if(req.query.format){const result={companyName:process.env.COMPANY_NAME||'Client Payment & Property Management System',title:'Payment Transactions',from,to,methods:parseMethods(req.query.methods),project:req.query.project||'',collectionQuery:[req.query.q||'',req.query.receipt?`Receipt: ${req.query.receipt}`:''].filter(Boolean).join(' · '),scope:'Filtered transactions; totals include valid posted payments only',generatedOn:today(),totalCollectionsCents:totalCents,totalExpensesCents:0,netCollectionCents:totalCents,collections:rows,expenses:[],breakdown:[]};return await writeFinancialExport(result,req.query.format,res)}
 res.json({success:true,data:{...(req.query.all==='1'?{rows,count:rows.length,page:1,pageSize:rows.length}:pageRows(rows,req.query.page||1)),totalCents,methods:parseMethods(req.query.methods),snapshot:fingerprint,companyName:process.env.COMPANY_NAME||"Client Payment & Property Management System"}});
}catch(e){next(e)}}
