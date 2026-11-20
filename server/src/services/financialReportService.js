import Reservation from '../models/Reservation.js';
import RefundRelease from '../models/RefundRelease.js';
import {attachBatchCounts} from "./paymentBatchCounts.js";
import PropertyAssignment from '../models/PropertyAssignment.js';
import Expense from '../models/Expense.js';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {financialRows} from '../utils/financialReporting.js';
async function loadReservations(to,session,compact){
 const reservations=Reservation.find({$or:[{'payment.paymentDate':{$lte:to}},{'precontractPayments.paymentDate':{$lte:to}}]});
 if(!compact)reservations.populate('client','clientId firstName lastName').populate('property','propertyId phaseNumber blockNumber lotNumber').populate('project','projectId projectName');
 if(session)reservations.session(session);
 return reservations.lean();
}
export function reservationCollection(hold){
 const {submissionHash,...payment}=hold.payment;
 return {...payment,accountId:null,reservationId:String(hold._id),type:hold.paymentPurpose||'RESERVATION_FEE',posted:true,status:'VALID',
   client:hold.client,project:hold.project,property:hold.property};
}
export function reservationCollections(hold,{includeApplied=false}={}){
 const applied=new Set(includeApplied?[]:hold.appliedPrecontractPaymentIds||[]);
 return [...(applied.has(hold.payment.paymentId)?[]:[reservationCollection(hold)]),...(hold.precontractPayments||[]).filter(p=>!applied.has(p.paymentId)).map(({submissionHash,...payment})=>({...payment,accountId:null,reservationId:String(hold._id),type:'DOWN_PAYMENT',posted:true,status:'VALID',client:hold.client,project:hold.project,property:hold.property}))];
}
// Prefer the current account payment (including approved corrections/voids).
// During a concurrent conversion a read may see the old hold or old account
// snapshot. Receipt identities prevent duplicate or missing cash in either case.
export function mergeReservationCollections(existing,holds,to='9999-12-31'){
 const seen=new Set(existing.map(p=>p.paymentId)),combined=[...existing];
 for(const hold of holds)for(const payment of reservationCollections(hold,{includeApplied:true})){
  if(payment.paymentDate>to||seen.has(payment.paymentId))continue;
  combined.push(payment);seen.add(payment.paymentId);
 }
 return combined;
}
export async function loadReservationCollections(to='9999-12-31'){
 return (await loadReservations(to,null,false)).flatMap(hold=>reservationCollections(hold)).filter(p=>p.paymentDate<=to);
}
export async function loadCollectionsWithReservations(existing,to='9999-12-31'){
 return mergeReservationCollections(existing,await loadReservations(to,null,false),to);
}
export async function loadFinancialData(to='9999-12-31',session=null,{compact=false}={}){
 const accountQuery=PropertyAssignment.find().select('assignmentId client project property migration payments commissionPayouts commissionRecoveries');
 const expenseQuery=Expense.find({expenseDate:{$lte:to}});
 const refundQuery=RefundRelease.find({date:{$lte:to},status:'POSTED'});
 if(!compact){
  accountQuery.populate('client','clientId firstName middleName lastName suffix').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber');
  expenseQuery.populate('project','projectId projectName').populate('createdBy','username');
  refundQuery.populate('client','clientId firstName lastName').populate('case','caseId snapshot.sources');
 }
 const [accounts,expenses,entries,refunds,holds]=await Promise.all([
  accountQuery.session(session).lean(),
  expenseQuery.session(session).lean(),
  CashLedgerEntry.find({effectiveDate:{$lte:to},$or:[{ledger:'OFFICE'},{ledger:{$exists:false}}]}).sort({effectiveDate:1,entryId:1}).session(session).lean(),
  refundQuery.session(session).lean(),
  loadReservations(to,session,compact)
 ]);
 if(!compact)await attachBatchCounts(accounts);
 const rows=financialRows(accounts,expenses);
 rows.collections=mergeReservationCollections(rows.collections,holds,to);
 for(const hold of holds){
  const payment=reservationCollection(hold);
  if(hold.refund&&hold.refund.date<=to)refunds.push({...hold.refund,status:'POSTED',releaseId:'RES-'+payment.paymentId,client:hold.client,
    reservationId:String(hold._id),project:hold.project,property:hold.property});
  for(const refund of hold.precontractRefunds||[])if(refund.date<=to)refunds.push({...refund,status:'POSTED',releaseId:'RES-DP-'+refund.paymentId,client:hold.client,reservationId:String(hold._id),project:hold.project,property:hold.property});
 }
 return {...rows,entries,refunds};
}
