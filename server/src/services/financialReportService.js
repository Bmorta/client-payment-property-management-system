import RefundRelease from '../models/RefundRelease.js';
import {attachBatchCounts} from "./paymentBatchCounts.js";
import PropertyAssignment from '../models/PropertyAssignment.js';
import Expense from '../models/Expense.js';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {financialRows} from '../utils/financialReporting.js';
export async function loadFinancialData(to='9999-12-31',session=null){
 const [accounts,expenses,entries,refunds]=await Promise.all([
  PropertyAssignment.find().select('assignmentId client project property migration payments commissionPayouts commissionRecoveries').populate('client','clientId firstName middleName lastName suffix').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').session(session).lean(),
  Expense.find({expenseDate:{$lte:to}}).populate('project','projectId projectName').populate('createdBy','username').session(session).lean(),
  CashLedgerEntry.find({effectiveDate:{$lte:to}}).sort({effectiveDate:1,entryId:1}).session(session).lean(),
  RefundRelease.find({date:{$lte:to},status:'POSTED'}).populate('client','clientId firstName lastName').populate('case','caseId snapshot.sources').session(session).lean()
 ]);
 await attachBatchCounts(accounts);return {...financialRows(accounts,expenses),entries,refunds};
}
