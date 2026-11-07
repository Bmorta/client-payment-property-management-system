import PropertyAssignment from '../models/PropertyAssignment.js';
import Expense from '../models/Expense.js';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {financialRows} from '../utils/financialReporting.js';
export async function loadFinancialData(to='9999-12-31'){
 const [accounts,expenses,entries]=await Promise.all([
  PropertyAssignment.find().select('assignmentId client project property payments commissionPayouts commissionRecoveries').populate('client','clientId firstName middleName lastName suffix').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').lean(),
  Expense.find({expenseDate:{$lte:to}}).populate('project','projectId projectName').populate('createdBy','username').lean(),
  CashLedgerEntry.find({effectiveDate:{$lte:to}}).sort({effectiveDate:1,entryId:1}).lean()
 ]);
 return {...financialRows(accounts,expenses),entries};
}
