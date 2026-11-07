import {createHash} from "node:crypto";
import {reportIdentity,brandExcel,brandPdf} from "../services/companyBranding.js";
import {isPosted} from "../utils/financialReporting.js";
import {paymentMethodLabel} from "../../../shared/paymentMethods.js";
import Project from "../models/Project.js";
import mongoose from 'mongoose';
import Expense from '../models/Expense.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {dateRange,today} from '../utils/accounting.js';
const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
export function summarizeExpenses(rows,from,to){
 const categories={},projects={},months={};let totalCents=0;
 for(const r of rows){totalCents+=r.amountCents;categories[r.category]=(categories[r.category]||0)+r.amountCents;const p=r.project?.projectName||'Office / Other';projects[p]=(projects[p]||0)+r.amountCents;const m=r.expenseDate.slice(0,7);months[m]=(months[m]||0)+r.amountCents}
 if(!Number.isSafeInteger(totalCents))fail('Expense totals exceed supported precision.');
 return {from,to,printedOn:today(),rows,totalCents,count:rows.length,categories,projects,months};
}
export async function expenseReportData(query){
 const {from,to}=dateRange(query),filter={expenseDate:{$gte:from,$lte:to}};
 if(query.project){if(!mongoose.isValidObjectId(query.project))fail('Invalid project.');filter.project=query.project}
 if(query.category){if(!['OFFICE','PROJECT','OTHER'].includes(query.category))fail('Invalid expense category.');filter.category=query.category}
 if(query.q){const regex=new RegExp(String(query.q).slice(0,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'i');filter.$or=['expenseId','description','payee','reference'].map(k=>({[k]:regex}))}
 const allRows=await Expense.find(filter).populate('project','projectId projectName').populate('createdBy','username firstName lastName').sort({expenseDate:1,expenseId:1}).lean();
 const rows=allRows.filter(isPosted);
 const selectedProject=query.project?await Project.findById(query.project).select("projectName").lean():null;
 return {...summarizeExpenses(rows,from,to),...await reportIdentity(query.project||rows.map(r=>r.project?._id).filter(Boolean)),category:query.category||'All categories',project:selectedProject?.projectName||'All projects',query:query.q||''};
}
export async function expenseReport(req,res,next){try{
 const data=await expenseReportData(req.query);data.snapshot=createHash('sha256').update(JSON.stringify({from:data.from,to:data.to,category:data.category,project:data.project,query:data.query,rows:data.rows,companyIdentity:data.companyIdentity})).digest('hex');if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==data.snapshot)throw Object.assign(new Error('Expense records or company branding changed. Refresh the report before exporting.'),{statusCode:409});
 if(!req.query.format)return res.json({success:true,data});
 const columns=['Expense ID','Expense Date','Category','Description','Project ID / Project','Amount PHP','Recorded By','Mode of Payment','Status'];
 const values=data.rows.map(r=>[r.expenseId,r.expenseDate,r.category,r.description,[r.project?.projectId,r.project?.projectName].filter(Boolean).join(' / '),r.amountCents/100,r.createdBy?.username||'Legacy record',paymentMethodLabel(r.method||'UNCLASSIFIED'),r.status||'POSTED']);
 if(req.query.format==='xlsx'){
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Expenses');sheet.addRow([data.companyName]);sheet.addRow([`Expense Report: ${data.from} to ${data.to}`]);sheet.addRow([`${data.category} · ${data.project} · Search: ${data.query||'All'} · Generated ${data.printedOn}`]);sheet.addRow(columns);values.forEach(r=>sheet.addRow(r));sheet.addRow(['TOTAL',null,null,null,null,data.totalCents/100]);sheet.getColumn(6).numFmt='#,##0.00';sheet.columns.forEach((c,i)=>c.width=i===3?45:24);sheet.views=[{state:'frozen',ySplit:4}];sheet.getRow(4).font={bold:true};sheet.autoFilter=`A4:I${Math.max(4,4+values.length)}`;sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};
  const summary=book.addWorksheet('Summary');summary.addRow(['Total PHP',data.totalCents/100]);summary.addRow(['Transactions',data.count]);for(const key of ['categories','projects','months']){summary.addRow([key]);Object.entries(data[key]).forEach(([k,v])=>summary.addRow([k,v/100]))}summary.getColumn(1).width=45;summary.getColumn(2).width=24;summary.getColumn(2).numFmt='#,##0.00';res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.attachment(`expenses-${data.from}-${data.to}.xlsx`);return res.send((brandExcel(book,sheet,data),Buffer.from(await book.xlsx.writeBuffer())));
 }
 if(req.query.format!=='pdf')fail('Choose xlsx or pdf.');
 const doc=new PDFDocument({size:'A4',margin:40}),chunks=[];doc.on('data',c=>chunks.push(c));const done=new Promise((resolve,reject)=>{doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 brandPdf(doc,data);doc.fontSize(14).text(data.companyName).fontSize(12).text('Expense Report').fontSize(10).text(`${data.from} to ${data.to} | Generated ${data.printedOn}`).text(`${data.category} | ${data.project} | Search: ${data.query||'All'}`).moveDown();
 for(const r of values){if(doc.y>690)doc.addPage();doc.fontSize(10).text(`${r[0]} | ${r[1]} | ${r[2]}`).text(`${r[3]} | ${r[4]||'Office / Other'}`).text(`PHP ${r[5].toFixed(2)} | Recorded by: ${r[6]} | Method: ${r[7]} | Status: ${r[8]}`).moveDown()}
 if(doc.y>700)doc.addPage();doc.fontSize(12).text(`TOTAL: PHP ${(data.totalCents/100).toFixed(2)} | ${data.count} transactions`);doc.end();res.type('application/pdf');res.attachment(`expenses-${data.from}-${data.to}.pdf`);res.send(await done);
}catch(e){next(e)}}
