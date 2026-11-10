import {reportIdentity} from "../services/companyBranding.js";
import {listProjectProperties} from "./propertyController.js";
import {getProject} from "./projectController.js";
import {filterInventory} from "../../../shared/inventoryFilters.js";
import {createHash} from "node:crypto";
import {exportCommissions} from "./commissionReportController.js";
import {listProjects} from './projectController.js';
import {listClients} from './clientController.js';
import {listUsers} from './userController.js';
import {listAgents,listCommissions} from './commissionController.js';
import {listActivity} from './activityController.js';
import {makeListReport,reportCsv,reportWorkbook,reportPdf} from '../utils/listReport.js';
const controllers={inventory:listProjectProperties,projects:listProjects,clients:listClients,users:listUsers,agents:listAgents,commissions:listCommissions,'activity-logs':listActivity};
const keys=['clients','accountStatuses','q','project','status','agent','client','property','account','type','from','to','sort','direction','user','module','action','report','phase','block','lot'];
export function canExportList(module,user){return !!user&&(!['users','activity-logs'].includes(module)||user.role==='ADMIN')}
export async function listReport(req,res,next){try{
 const module=req.params.module,controller=Object.hasOwn(controllers,module)?controllers[module]:null,format=req.query.format||'json';
 if(!controller)return res.status(404).json({success:false,message:'Unknown list report.'});
 if(!canExportList(module,req.user))return res.status(403).json({success:false,message:'Administrator access is required.'});
 if(!['json','csv','xlsx',...(module==='commissions'?['pdf']:[])].includes(format)||Object.entries(req.query).some(([k,v])=>typeof v!=='string'||v.length>(k==='clients'?25000:500)))return res.status(400).json({success:false,message:'Invalid report options.'});
 if(format!=='json'&&!/^[a-f0-9]{64}$/.test(req.query.expectedSnapshot||''))return res.status(400).json({success:false,message:'Open a report preview before downloading.'});
 const filters=Object.fromEntries(keys.filter(k=>req.query[k]).map(k=>[k,req.query[k]]));let payload,status=200;
 const output={status(n){status=n;return this},json(value){payload=JSON.parse(JSON.stringify(value));return this}};
 // Internal flag cannot be set through query parameters. Existing filters and sorting stay authoritative.
 const customCommission=module==='commissions'&&filters.report;
 await (customCommission?exportCommissions:controller)({user:req.user,params:module==='inventory'?{projectId:filters.project}:{},query:{...filters,page:'1',limit:'20',...(customCommission?{format:'json'}:{})},listExport:true},output,e=>{throw e});
 if(status>=400||!payload?.success)return res.status(status>=400?status:500).json(payload||{success:false,message:'Unable to generate report.'});
 let projectInfo;
 if(module==='inventory'){
  if(['phase','block','lot'].some(k=>filters[k]&&!/^[1-9]\d*$/.test(filters[k]))||filters.status&&!['AVAILABLE','RESERVED','SOLD','FOR_ASSUME','UNAVAILABLE'].includes(filters.status))return res.status(400).json({success:false,message:'Invalid inventory filter.'});
  await getProject({params:{id:filters.project}},{status(){return this},json(value){projectInfo=value.data}},e=>{throw e});
 }
 const records=module==='commissions'?payload.data.rows:module==='inventory'?filterInventory(payload.data,filters):payload.data;
 const report=customCommission?{...makeListReport('commissions',[],filters),...payload.data,count:payload.data.rows.length}:makeListReport(module,records,filters,['commissions','clients','agents'].includes(module)?payload.summary||payload.data.summary:undefined);
 if(!customCommission){const visibleProjects=module==='projects'?records.filter(r=>report.rows.some(row=>row[0]===r.projectId)).map(r=>r._id):records.map(r=>r.project?._id||r.project).filter(Boolean);Object.assign(report,await reportIdentity(filters.project||visibleProjects));}
 if(projectInfo)report.title=`Property Inventory — ${projectInfo.projectName} · ${projectInfo.projectId||projectInfo.projectCode||''}`;
 report.snapshot=createHash('sha256').update(JSON.stringify({title:report.title,companyIdentity:report.companyIdentity,companyName:report.companyName,filters:report.filters,headers:report.headers,rows:report.rows,summary:report.summary})).digest('hex');
 if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==report.snapshot)return res.status(409).json({success:false,message:'Records changed. Open a new preview before downloading.'});
 if(format==='pdf'){res.type('application/pdf');res.attachment('commissions.pdf');return res.send(await reportPdf(report))}
 if(format==='json')return res.json({success:true,data:report});
 if(format==='csv'){res.type('text/csv; charset=utf-8');res.attachment(`${module}.csv`);return res.send(reportCsv(report))}
 res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');res.attachment(`${module}.xlsx`);res.send(await reportWorkbook(report));
 }catch(error){next(error)}}
