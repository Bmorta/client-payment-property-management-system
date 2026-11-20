import Reservation from '../models/Reservation.js';
import {reservationDisplay} from '../services/reservationService.js';
import {reservationMetrics} from './reservationController.js';
import mongoose from 'mongoose';
import Account from '../models/PropertyAssignment.js';
import Property from '../models/Property.js';
import Project from '../models/Project.js';
import Client from '../models/Client.js';
import OfficePayout from '../models/OfficePayout.js';
import CancellationCase from '../models/CancellationCase.js';
import SiteRequest from '../models/SiteRequest.js';
import { adminReviewData } from '../services/adminReviews.js';
import { loadFinancialData } from '../services/financialReportService.js';
import { dateRange, today } from '../utils/accounting.js';
import { managementMetrics } from '../utils/managementDashboard.js';
import { releasedCents } from './officePayoutController.js';
import { requestFlags, TERMINAL_REQUEST_STATUSES } from '../../../shared/siteRequests.js';
import {saleInventoryStatus} from '../utils/salesClassification.js';

export async function managementDashboard(req,res,next){
  try{
    const {from,to}=dateRange(req.query), now=today();
    if(Date.parse(to)-Date.parse(from)>366*86400000)throw Object.assign(new Error('Choose a dashboard range of up to one year.'),{statusCode:400});
    const {project,phase,block}=req.query;
    if((project&&!mongoose.isValidObjectId(project))||[phase,block].some(value=>value&&!/^[1-9]\d{0,5}$/.test(value)))throw Object.assign(new Error('Choose valid inventory filters.'),{statusCode:400});
    const financial=req.user.role==='ADMIN';
    const operations=financial||req.user.role==='STAFF';
    const scope=project?{project}:{};
    const query={...scope,...(phase?{phaseNumber:Number(phase)}:{}),...(block?{blockNumber:Number(block)}:{})};
    const [projects,properties,accounts,ledger,activeClients,requests]=await Promise.all([
      Project.find().select('projectName status').sort({projectName:1}).lean(),
      Property.find(query).select('project status client reservation phaseNumber blockNumber').lean(),
      Account.find(scope).select(operations?
        '-notifications -auditEvents -commissionHoldHistory -forfeitureEvents -propertyReleaseEvents':
        'property project lifecycle cancellationOut.effectiveDate contract.contractDate transferIn.sourceId assumptionIn.sourceId reactivationIn.sourceId').lean(),
      financial?loadFinancialData(now,null,{compact:true}):null,
      operations?Client.find({status:'ACTIVE',deletedAt:null}).select('_id').lean():[],
      operations?SiteRequest.find({...scope,status:{$nin:TERMINAL_REQUEST_STATUSES}}).select('status schedule.start preferredStart').lean():[]
    ]);
    const projectStates=new Map(projects.map(p=>[String(p._id),p.status]));
    const accountsByLot=new Map();for(const a of accounts){const key=String(a.property);accountsByLot.set(key,[...(accountsByLot.get(key)||[]),a])}
    for(const property of properties){
      property.status=saleInventoryStatus(property,accountsByLot.get(String(property._id)),projectStates.get(String(property.project)));
    }
    const ids=new Set(activeClients.map(c=>String(c._id)));
    for(const a of accounts)a.clientStatus=ids.has(String(a.client))?'ACTIVE':null;
    const holdRows=operations&&properties.length?await Reservation.find({property:{$in:properties.map(p=>p._id)}}).select('held expiresOn status payment disposition agent account').lean():[];
    const data=managementMetrics({accounts,properties,financial:ledger,from,to,today:now,permissions:{operations,financial},inventoryScoped:!!(project||phase||block),reservations:holdRows});
    if(operations){
      data.reservations=reservationMetrics(holdRows.map(row=>({...row,...reservationDisplay(row,now)})),now);
    }
    data.activeClientMasterCount=operations&&!project&&!phase&&!block?ids.size:undefined;
    data.filters={from,to,today:now,project:project||'',phase:phase||'',block:block||''};
    data.projectOptions=projects.map(p=>({id:String(p._id),name:p.projectName,status:p.status}));
    data.permissions={operations,financial};
    if(operations)data.requests={scheduling:requests.filter(r=>['NEW','FOR_SCHEDULING'].includes(r.status)).length,visits:requests.filter(r=>requestFlags(r).upcoming).length};
    if(financial){
      const [reviews,payouts,refunds]=await Promise.all([
        adminReviewData(),
        OfficePayout.find({status:{$in:['APPROVED','PARTIALLY_PAID']}}).select('amountCents releases').lean(),
        CancellationCase.find({status:{$in:['APPROVED_PENDING','CANCELLED']}}).select('snapshot.distribution.refundCents snapshot.refundSchedule refundPaidCents').lean()
      ]);
      data.obligations={approvals:reviews.pending,approvalCategories:reviews.categories,payoutCount:payouts.length,payouts:payouts.reduce((n,p)=>n+Math.max(0,p.amountCents-releasedCents(p)),0),refunds:0,refundDue:0,refundCases:0};
      for(const c of refunds){
        const paid=c.refundPaidCents||0;
        const remaining=Math.max(0,(c.snapshot?.distribution?.refundCents||0)-paid);
        if(!remaining)continue;
        data.obligations.refunds+=remaining;
        data.obligations.refundCases++;
        const due=(c.snapshot?.refundSchedule||[]).filter(r=>r.date<=now).reduce((n,r)=>n+r.amountCents,0);
        if(due>paid)data.obligations.refundDue++;
      }
    }
    res.set('Cache-Control','no-store').json({success:true,data});
  }catch(error){next(error);}
}
