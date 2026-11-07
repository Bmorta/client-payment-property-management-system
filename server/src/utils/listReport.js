import ExcelJS from 'exceljs';
const name=r=>r.fullName||[r.firstName,r.middleName,r.lastName,r.suffix].filter(Boolean).join(' ');
const timestamp=v=>v?new Date(v).toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'';
const json=v=>JSON.stringify(v??null);
export const reportModules={
 projects:{title:'Projects',headers:['Project ID','Project','Code','Location','Start Date','Status'],row:r=>[r.projectId,r.projectName,r.projectCode,r.location,r.startDate?String(r.startDate).slice(0,10):'',r.status],search:r=>[r.projectId,r.projectName,r.projectCode,r.location].join(' ')},
 clients:{title:'Clients',headers:['Client ID','Name','Contact Number','Email','Address','Status'],row:r=>[r.clientId,name(r),r.contactNumber,r.email,r.address,r.status],search:r=>[r.clientId,r.firstName,r.lastName,r.email,r.contactNumber].join(' ')},
 agents:{title:'Agents',headers:['Agent ID','Name','Contact Number','Email','Address','Type','Status','Assigned Projects'],row:r=>[r.agentId,r.fullName,r.contactNumber,r.email,r.address,r.agentType,r.status,(r.assignedProjects||[]).map(p=>p.projectName).join('; ')]},
 users:{title:'Users',headers:['Username','Name','Email','Role','Status','Last Login (PHT)'],row:r=>[r.username,name(r),r.email,r.role,r.isActive?'Active':'Inactive',timestamp(r.lastLoginAt)],search:r=>[r.username,name(r),r.email,r.role].filter(Boolean)},
 'activity-logs':{title:'Activity Logs',headers:['Date / Time (PHT)','User','Role','Module','Action','Record','Description','Outcome','Previous Values','Updated Values'],row:r=>[timestamp(r.createdAt),r.username||r.userId?.username||'Historical user',r.userRole,r.module||r.entityType,r.action,r.entityId,r.description,r.outcome||'Historical entry',json(r.previousValues),json(r.updatedValues??r.metadata)]},
 commissions:{title:'Commission Ledger',headers:['Commission ID','Agent ID','Agent','Project','Property','Client','Type','Period','Agent %','Budget PHP','Earned PHP','Released PHP','Unreleased PHP','Awaiting PHP','Recovery PHP','Status','Latest Release Date'],row:r=>[r.commissionId,r.agentInfo?.agentId,r.agentInfo?.fullName,r.projectInfo?.projectName,`${r.propertyInfo?.propertyId||''} Phase ${r.propertyInfo?.phaseNumber} Block ${r.propertyInfo?.blockNumber} Lot ${r.propertyInfo?.lotNumber}`,name(r.clientInfo||{}),r.type,r.period,r.percentageBps/100,...['budgetCents','earnedCents','releasedCents','unreleasedCents','awaitingCents','recoveryDueCents'].map(k=>(r[k]||0)/100),r.status,r.latestReleaseDate||'']}
};
export function makeListReport(module,records,filters={},summary){
 const config=Object.hasOwn(reportModules,module)?reportModules[module]:null;if(!config)throw Object.assign(new Error('Unknown report.'),{statusCode:404});
 const q=module==='users'?String(filters.q||'').trim().toLowerCase():String(filters.q||'').toLowerCase();
 const matching=config.search?records.filter(r=>{const text=config.search(r);return Array.isArray(text)?text.some(v=>v.toLowerCase().includes(q)):text.toLowerCase().includes(q)}):records;
 return {title:config.title,companyName:process.env.COMPANY_NAME||'Client Payment & Property Management System',generatedOn:timestamp(new Date()),filters,count:matching.length,headers:config.headers,rows:matching.map(r=>config.row(r).map(v=>v??'')),...(summary?{summary}: {})};
}
const summaryLabels={propertyBudgetCents:'Property Commission Budget PHP',budgetCents:'Assigned Commission PHP',earnedCents:'Earned Commission PHP',releasedCents:'Released (gross) PHP',unreleasedCents:'Earned Unreleased PHP',awaitingCents:'Awaiting Buyer Payment PHP',recoveredCents:'Recovered PHP',recoveryDueCents:'Recovery Due PHP',pendingReleases:'Pending Releases'};
export const summaryRows=report=>Object.entries(report.summary||{}).filter(([key])=>summaryLabels[key]).map(([key,value])=>[summaryLabels[key],key.endsWith('Cents')?value/100:value]);
const csvCell=v=>{const s=typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'"+v:String(v??'');return '"'+s.replaceAll('"','""')+'"'};
export function reportCsv(report){return '\uFEFF'+[[report.companyName],[report.title],['Generated (PHT)',report.generatedOn],['Filters',JSON.stringify(report.filters)],['Matching records',report.count],...summaryRows(report),report.headers,...report.rows].map(r=>r.map(csvCell).join(',')).join('\r\n')}
export async function reportWorkbook(report){
 const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Records');
 for(const r of [[report.companyName],[report.title],['Generated (PHT)',report.generatedOn],['Filters',JSON.stringify(report.filters)],['Matching records',report.count],...summaryRows(report)])sheet.addRow(r);
 const header=sheet.addRow(report.headers);header.font={bold:true};header.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE6EDF7'}});
 report.rows.forEach(r=>{const row=sheet.addRow(r);row.alignment={vertical:'top',wrapText:true};row.height=32});
 sheet.columns.forEach((c,i)=>{c.width=report.headers[i]?.includes('Values')?55:26;if(report.headers[i]?.includes('PHP'))c.numFmt='"₱"#,##0.00'});
 sheet.getRow(1).font={bold:true,size:16};sheet.getRow(4).alignment={wrapText:true};sheet.getRow(4).height=32;
 sheet.views=[{state:'frozen',ySplit:header.number}];sheet.autoFilter={from:{row:header.number,column:1},to:{row:sheet.rowCount,column:report.headers.length}};
 sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printTitlesRow:`1:${header.number}`};
 return Buffer.from(await book.xlsx.writeBuffer());
}
export async function reportPdf(report){
 const {default:PDFDocument}=await import('pdfkit');
 const doc=new PDFDocument({size:'A4',layout:'landscape',margin:32}),chunks=[];
 const done=new Promise((resolve,reject)=>{doc.on('data',c=>chunks.push(c));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject)});
 doc.fontSize(16).text(report.companyName);doc.fontSize(13).text(report.title);doc.fontSize(9).text(`Generated ${report.generatedOn} PHT | ${report.count} matching records`);doc.text(`Filters: ${JSON.stringify(report.filters)}`);for(const [label,value] of summaryRows(report))doc.text(`${label}: ${value}`);doc.moveDown();
 for(const row of report.rows){if(doc.y>470)doc.addPage();doc.fontSize(9).text(report.headers.map((label,i)=>`${label}: ${row[i]??''}`).join(' | '),{width:doc.page.width-64});doc.moveDown()}
 doc.end();return done;
}
