import ReservationSettings from '../models/ReservationSettings.js';
import {reportIdentity} from '../services/companyBranding.js';
import Reservation from '../models/Reservation.js';
import Property from '../models/Property.js';
import Project from '../models/Project.js';
import { today } from '../utils/accounting.js';
import { addDays, defaultReservationDays, reservationDisplay, postReservation, previewConversion, convertReservation, manageReservation } from '../services/reservationService.js';

export function reservationMetrics(records,day) {
  const active=records.filter(row=>row.status==='ACTIVE');
  return {
      active:active.length,
      today:active.filter(row=>row.expiresOn===day).length,
      week:active.filter(row=>row.expiresOn>day&&row.expiresOn<=addDays(day,7)).length,
      expired:records.filter(row=>row.status==='EXPIRED').length,
      converted:records.filter(row=>row.status==='CONVERTED').length,
      feesCents:records.reduce((n,row)=>n+row.amountCents,0),
      creditCents:records.filter(row=>row.disposition==='OUTSTANDING').reduce((n,row)=>n+row.amountCents,0)
    };
}
export async function listReservations(req,res,next) {
  try {
    const filter=req.query.client&&/^[a-f\d]{24}$/i.test(req.query.client)?{client:req.query.client}:{};
    if(req.query.project&&/^[a-f\d]{24}$/i.test(req.query.project))filter.project=req.query.project;
    const rows=await Reservation.find(filter).populate('client','firstName lastName clientId')
      .populate('property','propertyId phaseNumber blockNumber lotNumber').populate('project','projectName')
      .populate('account','assignmentId').populate('agent','fullName agentId').sort({expiresOn:1}).lean();
    const day=today();
    const records=rows.map(row=>({...row,...reservationDisplay(row,day),payment:{...row.payment,submissionHash:undefined}}));
    const metrics=reservationMetrics(records,day);
    res.json({success:true,data:{records,metrics,day,defaultDays:await defaultReservationDays()}});
  } catch(e){next(e)}
}
export async function reservationLots(_req,res,next) {
  try {
    const projects=await Project.find({status:{$ne:'ARCHIVED'}}).select('_id').lean();
    const data=await Property.find({project:{$in:projects.map(p=>p._id)},status:'AVAILABLE',client:null,reservation:null,
      reopeningStatus:{$nin:['PENDING','REJECTED']},assumptionStatus:{$ne:'PENDING'}})
      .select('propertyId phaseNumber blockNumber lotNumber project').populate('project','projectName').sort({propertyId:1}).lean();
    res.json({success:true,data});
  } catch(e){next(e)}
}
export const reservationHandlers={
  post:req=>postReservation(req.body,req.user),
  preview:req=>previewConversion(req.params.id,req.body),
  convert:req=>convertReservation(req.params.id,req.body,req.user),
  manage:req=>manageReservation(req.params.id,req.body,req.user)
};
export const reservationHandler=action=>async(req,res,next)=>{
  try {res.json({success:true,data:await reservationHandlers[action](req)})}
  catch(e){next(e.code===11000?Object.assign(new Error('This reservation, lot or receipt is already in use.'),{statusCode:409}):e)}
};

export async function reservationAcknowledgement(req,res,next) {
  try {
    if(!/^[a-f\d]{24}$/i.test(req.params.id))return res.status(400).json({success:false,message:'Invalid reservation.'});
    const row=await Reservation.findById(req.params.id).populate('client','clientId firstName middleName lastName suffix')
      .populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').lean();
    if(!row)return res.status(404).json({success:false,message:'Reservation not found.'});
    const {submissionHash,...payment}=row.payment;
    res.json({success:true,data:{brand:await reportIdentity(row.project?._id),clientSnapshot:row.client,
      paymentDate:payment.paymentDate,method:payment.method,batchReference:payment.paymentId,totalCents:payment.amountCents,receivedBy:payment.actorUsername||'',
      members:[{...payment,project:row.project,property:row.property,purpose:'Reservation fee'}]}});
  } catch(e){next(e)}
}

export async function updateReservationSettings(req,res,next){
  try {
    const {holdDays}=req.body;
    if(!Number.isInteger(holdDays)||holdDays<1||holdDays>365)return res.status(400).json({success:false,message:'Choose a default hold period of 1 to 365 days.'});
    const data=await ReservationSettings.findOneAndUpdate({_id:'OFFICE'},{$set:{holdDays,updatedBy:req.user._id}},{upsert:true,new:true,runValidators:true});
    res.json({success:true,data});
  } catch(e){next(e)}
}
