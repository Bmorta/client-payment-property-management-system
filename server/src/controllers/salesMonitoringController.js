import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {createHash} from 'node:crypto';
import Property from '../models/Property.js';
import Project from '../models/Project.js';
import Account from '../models/PropertyAssignment.js';
import Client from '../models/Client.js';
import Agent from '../models/Agent.js';
import Reservation from '../models/Reservation.js';
import SalesPlanningRecord from '../models/SalesPlanningRecord.js';
import {loadSalesAttributions} from '../utils/salesPlanningData.js';
import {dateRange,today} from '../utils/accounting.js';
import {salesMonitoring} from '../utils/salesMonitoring.js';
import {financialRows} from '../utils/financialReporting.js';
import {mergeReservationCollections} from '../services/financialReportService.js';
import {reportIdentity,brandExcel,brandPdf} from '../services/companyBranding.js';
import {SALES_PAPERS,SALES_REPORT_TYPES,agentSalesColumns,agentFinanceColumns,agentCommissionColumns,agentCell,salesRegisterColumns,salesRegisterRow} from '../../../shared/salesReportViews.js';
import {focusedSalesWorkbook,focusedSalesPdf,pdfPage} from '../utils/salesReportExport.js';

const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
const types=['DIRECT','RESERVATION','TRANSFER','ASSUMPTION','REACTIVATION'];
const statuses=['INSTALLMENT','FULLY_PAID','SETTLEMENT_PENDING','PRINCIPAL_FULLY_PAID','CANCELLATION_PENDING','CANCELLED','FORFEITED','TRANSFERRED','ASSUMED','SUPERSEDED','CLOSED','REVIEW_REQUIRED'];
const amount=x=>x==null?'Unavailable':x/100;
const headings=['Contract','Buyer','Project','Property','Booking date','Type','Current status','Attributed agents','Attribution basis','Contract value PHP','Principal paid PHP','Current receivable PHP','Period movement PHP','Period events','Approved sales shares'];
const record=r=>[r.contractId,r.client,r.project,r.property,r.date,r.type,r.status,r.agents.join(', '),r.attribution,amount(r.valueCents),amount(r.principalPaidCents),amount(r.receivableCents),amount(r.periodMovementCents),r.periodEvents.join(', '),r.salesAttribution?.shares?.map((s,i)=>(r.agents[i]||s.agentId)+' '+s.role+' '+(s.shareBps/100).toFixed(2)+'%').join('; ')||'Not verified'];
const percent=x=>x==null?'N/A':(x*100).toFixed(2)+'%';
const advancedTables=p=>[
 ['YoY Comparison',['Measure','From','To','Selected period','Prior from','Prior to','Prior period','Change'],[['Gross booked PHP',p.comparison.from,p.comparison.to,amount(p.comparison.grossCents),p.comparison.priorFrom,p.comparison.priorTo,amount(p.comparison.priorGrossCents),percent(p.comparison.valueChange)],['Original contracts',p.comparison.from,p.comparison.to,p.comparison.contracts,p.comparison.priorFrom,p.comparison.priorTo,p.comparison.priorContracts,percent(p.comparison.countChange)]]],
 ['Run Rate Forecast',['Period start','As of','Period end','Elapsed days','Period days','Actual gross PHP','Projection PHP'],[[p.forecast.monthStart,p.forecast.asOf,p.forecast.monthEnd,p.forecast.elapsedDays,p.forecast.daysInMonth,amount(p.forecast.actualCents),amount(p.forecast.projectedCents)],[p.annualForecast.yearStart,p.annualForecast.asOf,p.annualForecast.yearEnd,p.annualForecast.elapsedDays,p.annualForecast.daysInYear,amount(p.annualForecast.actualCents),amount(p.annualForecast.projectedCents)]]],
 ['Sell Through',['Verified sold','Available','Reserved','Excluded','Rate'],p.sellThrough?[[p.sellThrough.sold,p.sellThrough.available,p.sellThrough.reserved,p.sellThrough.excluded,percent(p.sellThrough.rate)]]:[['N/A','N/A','N/A','N/A','N/A']]],
 ['Approved Leaderboard',['Rank','Agent','Attributed gross PHP','Weighted contracts','Primary sales'],p.leaderboard.map(r=>[r.rank,r.name,amount(r.valueCents),r.unitBps/10000,r.primarySales])],
 ['Calendar Targets',['Period','Scope','Name','Target PHP','Actual PHP','Value achievement','Target contracts','Actual weighted','Unit achievement','Active','Cutoff','Unverified office bookings','Unverified gross PHP'],p.targets.map(r=>[r.period,r.scope,r.label,amount(r.valueCents),amount(r.actualValueCents),percent(r.valueAchievement),r.units,r.actualUnitBps/10000,percent(r.unitAchievement),r.active?'Yes':'No',r.cutoff,r.unverifiedBookingCount,amount(r.unverifiedValueCents)])],
 ['Planning Notes',['Description','Value'],[['Scope',p.scope],['Planning year',p.year],['Unverified selected-period bookings',p.unverifiedBookingCount],['Unverified selected-period booked PHP',amount(p.unverifiedValueCents)]]]
];
export async function salesMonitoringReport(req,res,next){try{
 const {from,to}=dateRange(req.query),day=today(),{project='',agent='',type='',status='',format='json',reportType='FULL',paper='A4',orientation='landscape',planningYear=/^20\d{2}$/.test(to.slice(0,4))?to.slice(0,4):day.slice(0,4)}=req.query;
 if(!SALES_REPORT_TYPES.includes(reportType)||!Object.hasOwn(SALES_PAPERS,paper)||!['portrait','landscape'].includes(orientation)||reportType==='INDIVIDUAL'&&!agent)fail('Choose a valid report format and agent.');
 if(typeof planningYear!=='string'||!/^20\d{2}$/.test(planningYear))fail('Choose a planning year from 2000–2099.');
 if(to>day||Date.parse(to)-Date.parse(from)>366*86400000)fail('Choose a period of up to one year through today.');
 if([project,agent].some(x=>x&&!mongoose.isValidObjectId(x))||type&&!types.includes(type)||status&&!statuses.includes(status)||!['json','xlsx','pdf'].includes(format))fail('Choose valid sales filters.');
 const where=project?{project}:{};
 const [properties,projects,accounts,reservations,agents,clients]=await Promise.all([
  Property.find(where).limit(10001).lean(),Project.find().select('projectName status').sort({projectName:1}).lean(),
  Account.find(where).limit(25001).populate('client','clientId firstName middleName lastName suffix').lean(),
  Reservation.find(where).limit(25001).populate('client','clientId firstName middleName lastName suffix').lean(),Agent.find().select('agentId fullName status assignedProjects').sort({fullName:1}).lean(),
  Client.find({status:'PROSPECT',deletedAt:null}).select('_id status').lean()
 ]);
 if(properties.length>10000||accounts.length>25000||reservations.length>25000)fail('Select a project to narrow this large sales report.');
 if(agent&&!agents.some(a=>String(a._id)===agent))fail('Selected agent no longer exists.');
 const [attributed,planningTargets]=await Promise.all([loadSalesAttributions(accounts),SalesPlanningRecord.find({kind:'TARGET','value.period':{$regex:'^'+planningYear}}).select('value version').lean()]);
 const collections=mergeReservationCollections(financialRows(accounts,[]).collections,reservations);
 const report=salesMonitoring({accounts:attributed,properties,projects,agents,reservations,clients,collections,planningTargets,planningYear,from,to,today:day,project,agent,type,status});
 report.filters.planningYear=planningYear;
 const brand=await reportIdentity(project||projects.map(p=>p._id)),data={...report,...brand,title:'Sales Monitoring & Register',projectOptions:projects.map(p=>({id:String(p._id),label:p.projectName})),agentOptions:agents.map(a=>({id:String(a._id),label:a.fullName,agentCode:a.agentId,status:a.status,projects:(a.assignedProjects||[]).map(id=>projects.find(p=>String(p._id)===String(id))?.projectName).filter(Boolean)}))};
 data.snapshot=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==data.snapshot)fail('Sales records changed. Refresh the report before exporting.',409);
 res.set('Cache-Control','no-store');
 if(format==='json')return res.json({success:true,data});
 if(reportType!=='FULL'){
  if(format==='xlsx')return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('sales-'+reportType.toLowerCase()+'.xlsx').send(await focusedSalesWorkbook(data,reportType,paper,orientation));
  res.type('application/pdf').attachment('sales-'+reportType.toLowerCase()+'.pdf');return focusedSalesPdf(data,reportType,paper,orientation,res);
 }
 const summaryRows=Object.entries(data.summary).map(([key,value])=>[key.endsWith('Cents')?key.replace(/Cents$/,' PHP'):key,key.endsWith('Cents')?amount(value):key==='conversionRate'?(value==null?'Unavailable':(value*100).toFixed(2)+'%'):value??'Not applicable']);
 if(format==='xlsx'){
  const wb=new ExcelJS.Workbook(),sheet=wb.addWorksheet('Summary');sheet.addRows([[brand.companyName],[data.title],[from+' to '+to,'Current snapshot '+day],['Filters',JSON.stringify(data.filters)],['Scope',data.scope],...summaryRows]);sheet.columns=[{width:35},{width:100}];sheet.getRow(5).alignment={wrapText:true};sheet.getRow(5).height=88;brandExcel(wb,sheet,brand);
  const tab=(title,headers,rows)=>{const s=wb.addWorksheet(title);s.addRow(headers);s.addRows(rows);s.getRow(1).font={bold:true};s.views=[{state:'frozen',ySplit:1}];s.columns.forEach(c=>c.width=25);return s};
  tab('Sales Register',headings,data.register.map(record));
  tab('Detailed Sales',salesRegisterColumns,data.register.map(salesRegisterRow));
  for(const [title,columns] of [['Agent Sales',agentSalesColumns],['Agent Collections',agentFinanceColumns],['Agent Commissions',agentCommissionColumns]])tab(title,columns.map(c=>c[1]),data.agents.map(r=>columns.map(([key])=>agentCell(r,key))));
  tab('Movements',['Date','Contract','Project','Property','Event','Amount PHP'],data.events.map(e=>[e.date,e.contractId,e.project,e.property,e.kind,amount(e.amountCents)]));
  tab('Actual Receipts',['Date','Payment ID','Receipt','Project','Property','Purpose','Amount PHP'],data.receiptDetails.map(r=>[r.date,r.paymentId,r.receiptNumber,r.project,r.property,r.type,amount(r.amountCents)]));
  tab('Reservations',['Buyer','Project','Property','Agent','Start','Expiry','Converted','Status','Fee PHP'],data.reservationDetails.map(r=>[r.buyer,r.project,r.property,r.agent,r.startDate,r.expiresOn,r.convertedOn,r.status,amount(r.feeCents)]));
  tab('Monthly Trends',['Month','Gross sales PHP','Net movement PHP','Collections PHP','Cancellations','Forfeitures'],data.months.map(r=>[r.month,amount(r.grossSalesCents),amount(r.netMovementCents),amount(r.collectionsCents),r.cancelled,r.forfeited]));
  const groupHeaders=['Name','Original sales','Gross booked PHP','Current valid PHP','Valid contracts','Cancelled','Forfeited','Converted','Earned PHP','Released PHP','Unreleased PHP'];
  const groupRow=r=>[r.label,r.newContracts,amount(r.grossSalesCents),amount(r.currentValueCents),r.activeContracts,r.cancelled,r.forfeited,r.converted,amount(r.earnedCents),amount(r.releasedCents),amount(r.unreleasedCents)];
  tab('Projects',groupHeaders,data.projects.map(groupRow));tab('Agents',groupHeaders,data.agents.map(groupRow));tab('Review Warnings',['Warning'],data.warnings.map(w=>[w]));
  for(const [title,headers,rows] of advancedTables(data.performance))tab(title,headers,rows);
  return res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('sales-monitoring.xlsx').send(Buffer.from(await wb.xlsx.writeBuffer()));
 }
 const doc=new PDFDocument(pdfPage(paper,orientation));res.type('application/pdf').attachment('sales-monitoring.pdf');doc.pipe(res);brandPdf(doc,brand);doc.fontSize(16).text(brand.companyName||'').text(data.title);doc.fontSize(10).text(from+' to '+to+' | Current snapshot '+day+' PHT').text(JSON.stringify(data.filters)).text(data.scope).moveDown();
 for(const [key,value] of summaryRows)doc.text(key+': '+value);
 doc.addPage().fontSize(14).text('Sales Register');for(const row of data.register){doc.moveDown().fontSize(9).text(headings.map((h,i)=>h+': '+record(row)[i]).join(' | '))}
 doc.addPage().fontSize(14).text('Contract Movements');for(const e of data.events)doc.fontSize(9).text([e.date,e.contractId,e.project,e.property,e.kind,amount(e.amountCents)].join(' | '));
 doc.addPage().fontSize(14).text('Actual Receipts');for(const r of data.receiptDetails)doc.fontSize(9).text([r.date,r.paymentId,r.receiptNumber,r.project,r.property,r.type,amount(r.amountCents)].join(' | '));
 doc.addPage().fontSize(14).text('Reservations');for(const r of data.reservationDetails)doc.fontSize(9).text([r.buyer,r.project,r.property,r.agent,r.startDate,r.expiresOn,r.convertedOn,r.status,amount(r.feeCents)].join(' | '));
 doc.addPage().fontSize(14).text('Monthly Trends');for(const r of data.months)doc.fontSize(9).text([r.month,'Gross '+amount(r.grossSalesCents),'Net '+amount(r.netMovementCents),'Collections '+amount(r.collectionsCents),'Cancelled '+r.cancelled,'Forfeited '+r.forfeited].join(' | '));
 for(const [title,rows] of [['Projects',data.projects],['Agents',data.agents]]){doc.moveDown().fontSize(14).text(title);for(const r of rows)doc.fontSize(9).text([r.label,'Original sales '+r.newContracts,'Gross '+amount(r.grossSalesCents),'Current '+amount(r.currentValueCents),'Converted '+r.converted,'Earned '+amount(r.earnedCents),'Released '+amount(r.releasedCents),'Unreleased '+amount(r.unreleasedCents)].join(' | '))}
 doc.addPage().fontSize(14).text('Advanced Sales Planning').fontSize(9).text(data.performance.scope);
 for(const [title,headers,rows] of advancedTables(data.performance)){doc.moveDown().fontSize(12).text(title);for(const row of rows)doc.fontSize(9).text(headers.map((h,i)=>h+': '+row[i]).join(' | '))}
 if(data.warnings.length){doc.addPage().fontSize(14).text('Review Warnings');for(const w of data.warnings)doc.fontSize(9).text(w)}doc.end();
}catch(error){next(error)}}
