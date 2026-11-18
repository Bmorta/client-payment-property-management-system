import RefundRelease from '../models/RefundRelease.js';
import {attachBatchCounts} from "./paymentBatchCounts.js";
import PropertyAssignment from '../models/PropertyAssignment.js';
import Expense from '../models/Expense.js';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {financialRows} from '../utils/financialReporting.js';
export async function loadFinancialData(to='9999-12-31',session=null,{compact=false}={}){
 const accountQuery=PropertyAssignment.find().select('assignmentId client project property migration payments commissionPayouts commissionRecoveries');
 const expenseQuery=Expense.find({expenseDate:{$lte:to}});
 const refundQuery=RefundRelease.find({date:{$lte:to},status:'POSTED'});
 if(!compact){
  accountQuery.populate('client','clientId firstName middleName lastName suffix').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber');
  expenseQuery.populate('project','projectId projectName').populate('createdBy','username');
  refundQuery.populate('client','clientId firstName lastName').populate('case','caseId snapshot.sources');
 }
 const [accounts,expenses,entries,refunds]=await Promise.all([
  accountQuery.session(session).lean(),
  expenseQuery.session(session).lean(),
  CashLedgerEntry.find({effectiveDate:{$lte:to},$or:[{ledger:'OFFICE'},{ledger:{$exists:false}}]}).sort({effectiveDate:1,entryId:1}).session(session).lean(),
  refundQuery.session(session).lean()
 ]);
 if(!compact)await attachBatchCounts(accounts);return {...financialRows(accounts,expenses),entries,refunds};
}
