import Reservation from '../models/Reservation.js';
import RefundRelease from '../models/RefundRelease.js';
import {attachBatchCounts} from "./paymentBatchCounts.js";
import PropertyAssignment from '../models/PropertyAssignment.js';
import Expense from '../models/Expense.js';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {financialRows} from '../utils/financialReporting.js';
async function loadReservations(to,session,compact){
 const reservations=Reservation.find({'payment.paymentDate':{$lte:to}});
 if(!compact)reservations.populate('client','clientId firstName lastName').populate('property','propertyId phaseNumber blockNumber lotNumber').populate('project','projectId projectName');
 if(session)reservations.session(session);
 return reservations.lean();
}
export function reservationCollection(hold){
 const {submissionHash,...payment}=hold.payment;
 return {...payment,accountId:null,reservationId:String(hold._id),type:'RESERVATION_FEE',posted:true,status:'VALID',
   client:hold.client,project:hold.project,property:hold.property};
}
export async function loadReservationCollections(to='9999-12-31'){
 return (await loadReservations(to,null,false)).map(reservationCollection);
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
 for(const hold of holds){
  const payment=reservationCollection(hold);
  rows.collections.push(payment);
  if(hold.refund&&hold.refund.date<=to)refunds.push({...hold.refund,status:'POSTED',releaseId:'RES-'+payment.paymentId,client:hold.client,
    reservationId:String(hold._id),project:hold.project,property:hold.property});
 }
 return {...rows,entries,refunds};
}
