import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {brandExcel,brandPdf} from '../services/companyBranding.js';
import {SALES_PAPERS,salesReportView} from '../../../shared/salesReportViews.js';
const details=data=>[['Reporting period',data.from+' to '+data.to],['Generated / current snapshot (PHT)',data.today],['Filters',JSON.stringify(data.filters)]];
const display=(value,header)=>typeof value==='number'&&header.includes('PHP')?new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP',currencyDisplay:'code'}).format(value):String(value??'');
const cellDisplay=(row,headers,i)=>display(row[i],headers[i]==='Value'?String(row[0]):headers[i]);
export const pdfPage=(paper,orientation)=>{const [w,h]=SALES_PAPERS[paper].map(x=>x*72/25.4);return {size:orientation==='landscape'?[h,w]:[w,h],margin:34}};
export async function focusedSalesWorkbook(data,type,paper,orientation){
 const view=salesReportView(data,type),book=new ExcelJS.Workbook();
 const meta=book.addWorksheet('Report details');meta.addRows([[data.companyName],[view.title],...details(data),['Scope',view.scope]]);meta.columns=[{width:33},{width:100}];meta.getRow(6).alignment={wrapText:true};meta.getRow(6).height=80;brandExcel(book,meta,data);
 for(const section of view.sections){const sheet=book.addWorksheet(section.title.slice(0,31));sheet.addRow(section.headers);sheet.addRows(section.rows);sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];sheet.columns.forEach((c,i)=>{c.width=25;if(section.headers[i]?.includes('PHP'))c.numFmt='"₱"#,##0.00'});if(section.headers[1]==='Value')section.rows.forEach((row,i)=>{if(String(row[0]).includes('PHP'))sheet.getRow(i+2).getCell(2).numFmt='"₱"#,##0.00'});sheet.pageSetup={paperSize:paper==='LETTER'?1:9,orientation,fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:'1:1'};}
 return Buffer.from(await book.xlsx.writeBuffer());
}
export function focusedSalesPdf(data,type,paper,orientation,res){
 const view=salesReportView(data,type),doc=new PDFDocument(pdfPage(paper,orientation));doc.pipe(res);brandPdf(doc,data);doc.fontSize(16).text(data.companyName||'').fontSize(14).text(view.title).fontSize(9);for(const [k,v] of details(data))doc.text(k+': '+v);doc.text(view.scope).moveDown();
 const top=()=>doc.page.margins.top,bottom=()=>doc.page.height-doc.page.margins.bottom,left=()=>doc.page.margins.left,width=()=>doc.page.width-doc.page.margins.left-doc.page.margins.right;
 for(const section of view.sections){
  if(doc.y+60>bottom())doc.addPage();
  doc.fontSize(12).text(section.title).moveDown(.4);
  // Wide rows use readable labelled entries rather than forcing microscopic columns.
  if(section.headers.length>(orientation==='portrait'?5:8)){
   for(const row of section.rows){const content=section.headers.map((h,i)=>h+': '+display(row[i],h)).join(' | ');doc.fontSize(9);const height=doc.heightOfString(content,{width:width()})+8;if(doc.y+height>bottom()&&height<bottom()-top()){doc.addPage();doc.fontSize(11).text(section.title+' (continued)').fontSize(9)}doc.text(content,{width:width()}).moveDown(.5)}
  }else{
   const columns=section.headers.length,cw=width()/columns;
   const draw=(row,header=false)=>{doc.fontSize(9).font(header?'Helvetica-Bold':'Helvetica');const cells=row.map((v,i)=>header?String(v):cellDisplay(row,section.headers,i)),height=Math.max(...cells.map(v=>doc.heightOfString(v,{width:cw-8})))+8,y=doc.y;
    for(let i=0;i<cells.length;i++){const x=left()+i*cw;if(header)doc.rect(x,y,cw,height).fill('#e6edf7');doc.lineWidth(.4).strokeColor('#b9c4d1').rect(x,y,cw,height).stroke();doc.fillColor('#111827').text(cells[i],x+4,y+4,{width:cw-8})}doc.x=left();doc.y=y+height;};
   draw(section.headers,true);
   for(const row of section.rows){doc.font('Helvetica').fontSize(9);const height=Math.max(...row.map((v,i)=>doc.heightOfString(cellDisplay(row,section.headers,i),{width:cw-8})))+8;if(height>bottom()-top()-45){doc.text(row.map((v,i)=>section.headers[i]+': '+cellDisplay(row,section.headers,i)).join(' | '),{width:width()}).moveDown();continue}if(doc.y+height>bottom()){doc.addPage();doc.fontSize(11).text(section.title+' (continued)');draw(section.headers,true)}draw(row)}
  }
  if(!section.rows.length)doc.fontSize(9).text('No matching records.');doc.moveDown();
 }
 doc.end();
}
