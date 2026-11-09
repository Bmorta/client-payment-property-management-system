import {pagedExpenses} from "./expenseListController.js";
import {attachBatchCounts} from "../services/paymentBatchCounts.js";
import {needsAllocationChoice,paymentContext} from '../utils/paymentContext.js';
import {reportIdentity,brandExcel} from "../services/companyBranding.js";
import {createHash} from "node:crypto";
import Agent from "../models/Agent.js";
import MigrationBatch from "../models/MigrationBatch.js";
import {validateMonthlyArrangement} from "../../../shared/contractTerms.js";
import {validateFunding,physicalFunding} from "../utils/fundingAccount.js";
import {financialRows,isPosted} from "../utils/financialReporting.js";
import {expenseClassification} from "./cashLedgerController.js";
import {transactionReport} from "./collectionReportController.js";
import {validateReceipt,checkReceipt,receiptScope} from "../services/receiptService.js";
import {dashboardCharts} from "../utils/dashboardCharts.js";
import {paymentRegisterWorkbook,registerData} from "../utils/paymentRegister.js";
import {monitoringReports,reportColumns,reportRow} from "../utils/monitoringReports.js";
import {validateTerms,configureSchedule} from "../utils/contractMonitoring.js";
import {attachMonitoringUpdate,reconcileAccount} from "../services/monitoringService.js";
import {allocationPreview} from "../utils/allocationPreview.js";
import { allocatePayments, effectivePayment } from "../utils/paymentLedger.js";
import mongoose from "mongoose";
import PropertyAssignment from "../models/PropertyAssignment.js";
import Property from "../models/Property.js";
import Client from "../models/Client.js";
import Project from "../models/Project.js";
import Expense from "../models/Expense.js";
import { lotPrice } from "../utils/lotPricing.js";
import { moneyCents, buildSchedule, summarizeAccount, validDate, dateRange, today, METHODS, TERMS } from "../utils/accounting.js";
import { generateRecordId } from "../utils/generateRecordId.js";
import { logActivity } from "../utils/activityLogger.js";
const fail = (code, message) => { throw Object.assign(new Error(message), { statusCode: code }); };
const id = value => { if (typeof value !== "string" || !mongoose.isValidObjectId(value)) fail(400, "Invalid identifier."); return value; };
const text = (value, max = 500) => { if (value != null && typeof value !== "string") fail(400, "Invalid text field."); return (value || "").trim().slice(0, max); };
const requestKey = value => { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) fail(400, "Invalid submission ID. Reload the form."); return value; };
const populate = query => query.populate("client", "clientId firstName middleName lastName suffix").populate("project", "projectId projectName projectCode").populate("property", "propertyId phaseNumber blockNumber lotNumber areaSqm pricePerSqm status reopeningStatus forfeitureAccount");
const accountData = (account, user) => {
  const { auditEvents, notifications, correctionRequests, ...safe } = account;
  const { allocations } = allocatePayments(account);
  return { ...safe, payments: (account.payments||[]).map(p=>({...effectivePayment(p),allocations:allocations[p.paymentId]||[]})),
    correctionRequests:(correctionRequests||[]).filter(r=>user?.role==="ADMIN"||String(r.requestedBy)===String(user?._id)),summary:summarizeAccount(account) };
};
export async function getAccount(req,res,next) {
 try {const account=await populate(PropertyAssignment.findById(id(req.params.id))).lean();if(!account)fail(404,"Account not found.");await attachBatchCounts([account]);const progress=await MigrationBatch.findOne({account:account._id}).select("status cutoffDate batchId").lean();if(progress)account.migrationProgress=progress;res.json({success:true,data:accountData(account,req.user)})}catch(e){next(e)}
}
export async function listAccounts(req, res, next) {
  try {
    const filter = req.query.client ? { client: id(req.query.client) } : {};
    const accounts = await populate(PropertyAssignment.find(filter)).sort({ createdAt: -1 }).lean();
    await attachBatchCounts(accounts);
    const migrations=await MigrationBatch.find({account:{$in:accounts.map(a=>a._id)}}).select("account status cutoffDate batchId").lean();
    res.json({ success: true, data: accounts.map(a=>{const progress=migrations.find(b=>String(b.account)===String(a._id));return accountData({...a,...(progress?{migrationProgress:progress}:{})},req.user)}) });
  } catch (e) { next(e); }
}
export async function assignProperty(req, res, next) {
  let claimed = null, created = null;
  try {
    const clientId = id(req.params.id), propertyId = id(req.body.propertyId);
    const client = await Client.findById(clientId);
    if (!client || client.status !== "ACTIVE") fail(409, "Choose an active client.");
    const property = await Property.findById(propertyId);
    if (!property) fail(404, "Lot not found.");
    if(["PENDING","REJECTED"].includes(property.reopeningStatus))fail(409,"This lot requires administrator reopening approval before a new assignment.");
    const project = await Project.findById(property.project);
    if (!project || project.status === "ARCHIVED") fail(409, "This project cannot accept assignments.");
    if ((req.body.expectedAreaSqm !== undefined && req.body.expectedAreaSqm !== property.areaSqm) || (req.body.expectedPricePerSqm !== undefined && req.body.expectedPricePerSqm !== property.pricePerSqm)) fail(409, "This lot's area or price changed. Refresh and review the new price before assigning.");
    const total = lotPrice(property.areaSqm, property.pricePerSqm);
    if (total == null || total <= 0) fail(400, "Set this lot's area and price per sqm before assigning it.");
    const totalCents = moneyCents(total), months = Number(req.body.months);
    const firstDueDate = req.body.firstDueDate, contractDate = req.body.contractDate;
    const downPaymentCents = moneyCents(req.body.downPayment || 0);
    if (contractDate > today()) fail(400, "Contract date cannot be in the future.");
    const monitoringTerms=validateTerms(req.body.monitoringTerms?{...req.body.monitoringTerms,effectiveDate:contractDate}:null,contractDate);
    if(monitoringTerms&&req.body.monthlyInstallment===undefined)fail(400,"Configure the monthly installment amount.");
    if(monitoringTerms)validateMonthlyArrangement(totalCents,downPaymentCents,months,req.body.monthlyInstallment,req.body.monthlyOverrideAcknowledged);
    const schedule=configureSchedule(buildSchedule(totalCents,months,firstDueDate,downPaymentCents,contractDate),monitoringTerms,req.body.monthlyInstallment);
    if(schedule.some(s=>s.dueDate<contractDate))fail(400,"Due day cannot move an installment before the contract date.");
    if (await PropertyAssignment.exists({ property: propertyId,lifecycle:{$nin:["TRANSFERRED","CANCELLED","FORFEITED","SUPERSEDED"]} })) fail(409, "This lot already has an account. Use that account instead.");
    await PropertyAssignment.init();
    claimed = await Property.findOneAndUpdate({ _id: propertyId, areaSqm: property.areaSqm, pricePerSqm: property.pricePerSqm, reopeningStatus:{$nin:["PENDING","REJECTED"]}, $or: [{ client: null, status: "AVAILABLE" }, { client: clientId, status: "RESERVED" }] }, { $set: { client: clientId, status: "RESERVED" } }, { new: true });
    if (!claimed) fail(409, "This lot is no longer available or is already linked to a client.");
    created = await PropertyAssignment.create({ penaltyCalculationRule:'CURRENT_OVERDUE',assignmentId: await generateRecordId("contract"), client: clientId, project: property.project, property: propertyId,
      contract: { monitoringTerms, monthlyInstallmentCents:schedule.find(s=>s.installment>0)?.amountCents, totalCents, months, termType: req.body.termType === "CUSTOM" || !TERMS.includes(months) ? "CUSTOM" : "PREDEFINED", firstDueDate:schedule.find(s=>s.installment>0)?.dueDate||firstDueDate, contractDate, downPaymentCents, areaSqm: property.areaSqm, pricePerSqm: property.pricePerSqm, schedule }, createdBy: req.user._id, auditEvents: [{ eventId: req.auditEvent?._id, action: "AGREEMENT_CREATED", username: req.user.username, role: req.user.role, userId: req.user._id, timestamp: new Date() }] });
    if(monitoringTerms)await reconcileAccount(created._id,{userId:req.user._id,username:req.user.username,role:req.user.role},"Contract created");
    await logActivity({ action: "PROPERTY_ASSIGNED", req, userId: req.user._id, entityType: "PropertyAssignment", entityId: created._id, metadata: { client: clientId, property: propertyId } });
    res.status(201).json({ success: true, message: "Lot assigned and payment schedule created.", data: created });
  } catch (e) {
    // A database/network failure can occur after the insert committed. Keep the
    // client claim protected; retrying for the same client can finish the setup.
    if (claimed && !created && e?.code !== 11000) e.message += " The lot remains protected for this client. Check accounts, then retry the assignment if absent.";
    if (e?.code === 11000) e = Object.assign(new Error("An account for this lot already exists. Refresh accounts before retrying."), { statusCode: 409 });
    next(e);
  }
}
const samePayment = (p, input) => p.amountCents === input.amountCents && p.paymentDate === input.paymentDate && p.method === input.method && p.reference === input.reference && p.notes === input.notes && (p.type || "AUTO") === (input.type || "AUTO") && physicalFunding(p.method,p.fundingAccount)===input.fundingAccount && p.receiptNumber===input.receiptNumber && JSON.stringify(p.configuration||{})===JSON.stringify(input.configuration||{});
export async function acceptPayment(req, res, next) {
  try {
    const accountId = id(req.body.accountId), requestId = requestKey(req.body.requestId);
    const amountCents = moneyCents(req.body.amount), paymentDate = req.body.paymentDate;
    if (!amountCents || !validDate(paymentDate) || paymentDate > today() || !METHODS.includes(req.body.method)) fail(400, "Enter a positive payment, valid date and payment method.");
    if (req.body.type && !["AUTO","DOWN_PAYMENT","INSTALLMENT","PENALTY"].includes(req.body.type)) fail(400,"Invalid payment type.");
    const input = { fundingAccount:validateFunding(req.body.method,req.body.fundingAccount),receiptNumber:validateReceipt(req.body.receiptNumber),receiptScope:receiptScope(), configuration:paymentConfiguration(req.body.configuration,req.user), type: req.body.type || "AUTO", amountCents, paymentDate, method: req.body.method, reference: text(req.body.reference, 120), notes: text(req.body.notes) };
    let account = await PropertyAssignment.findById(accountId).lean();
    if (!account) fail(404, "Client account not found.");
    if (paymentDate < account.contract.contractDate) fail(400, "Payment date cannot be before the contract date.");
    const existing = account.payments.find(p => p.requestId === requestId);
    if (existing) {
      if (!samePayment(existing, input)) fail(409, "This submission was already used for a different payment. Refresh history before retrying.");
      return res.json({ success: true, data: existing, message: "This payment was already recorded. No duplicate created." });
    }
    const [client, project] = await Promise.all([Client.findById(account.client), Project.findById(account.project)]);
    if (!client || client.status !== "ACTIVE" || !project || project.status === "ARCHIVED") fail(409, "Payments require an active client and a project that is not archived.");
    const payment = { ...input, agreementVersion: (account.agreementHistory?.length || 0) + 1, actorUsername: req.user.username, actorRole: req.user.role, requestId, paymentId: await generateRecordId("payment"),  createdBy: req.user._id, createdAt: new Date() };
    if(needsAllocationChoice(account,input))fail(400,"This payment has both outstanding principal and penalties. Choose its allocation priority or an explicit payment type, then review the allocation.");
    const proposed={...account,payments:[...account.payments,payment]};
    const preview=allocationPreview(account,proposed,payment.paymentId);
    // Generated IDs are normalized for preview/confirm comparison.
    const normalized=allocationPreview(account,{...account,payments:[...account.payments,{...payment,paymentId:"PREVIEW"}]},"PREVIEW");
    if(account.contract.monitoringTerms && req.body.previewToken!==normalized.token)fail(409,"Review the allocation preview again; the account or contractual date changed.");
    await checkReceipt(input.receiptNumber,input.receiptScope,accountId,payment.paymentId,requestId,true,true);
    payment.allocations=preview.allocations;
    const update=attachMonitoringUpdate(proposed,{ $push: {payments:payment,auditEvents:{eventId:req.auditEvent?._id,action:"PAYMENT_RECORDED",userId:req.user._id,username:req.user.username,role:req.user.role,timestamp:new Date(),updatedValues:payment}},$inc:{__v:1}}, {userId:req.user._id,username:req.user.username,role:req.user.role},"Payment posted");
    account = await PropertyAssignment.findOneAndUpdate({ _id: accountId, __v: account.__v ?? 0, "payments.requestId": { $ne: requestId }
    }, update, { new: true, runValidators: true }).lean();
    if (!account) {
      const latest = await PropertyAssignment.findById(accountId).lean();
      const previous = latest?.payments.find(p => p.requestId === requestId);
      if (previous && samePayment(previous, input)) return res.json({ success: true, data: previous, message: "Payment already recorded. No duplicate created." });
      fail(409, "Payment exceeds the remaining balance or the account changed. Refresh before retrying.");
    }
    await logActivity({ action: "PAYMENT_RECORDED", req, userId: req.user._id, entityType: "PropertyAssignment", entityId: accountId, metadata: { paymentId: payment.paymentId, amountCents } });
    res.status(201).json({ success: true, data: payment, summary: summarizeAccount(account), message: "Client payment recorded." });
  } catch (e) { next(e); }
}
async function paymentRows() {
  const accounts = await populate(PropertyAssignment.find({ "payments.0": { $exists: true } })).lean();
  await attachBatchCounts(accounts);return financialRows(accounts,[]).collections.sort((a,b)=>b.paymentDate.localeCompare(a.paymentDate)||new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
}
export async function listPayments(req, res, next) {
  if(req.query.paged||req.query.format||req.query.origin!==undefined||req.query.receipt!==undefined)return transactionReport(req,res,next);
  try { res.json({ success: true, data: await paymentRows() }); } catch (e) { next(e); }
}
export async function listExpenses(req, res, next) {
  if(req.query.paged==='1')return pagedExpenses(req,res,next);
  try { res.json({ success: true, data: await Expense.find().populate("project", "projectId projectName projectCode").sort({ expenseDate: -1, createdAt: -1 }).lean() }); } catch (e) { next(e); }
}
export async function createExpense(req, res, next) {
  try {
    const requestId = requestKey(req.body.requestId), amountCents = moneyCents(req.body.amount);
    const { category, expenseDate } = req.body;
    const description = text(req.body.description);
    if (!amountCents || !description || !["OFFICE", "PROJECT", "OTHER"].includes(category) || !validDate(expenseDate) || expenseDate > today()) fail(400, "Enter a positive amount, description, category and valid expense date.");
    const project = category === "PROJECT" ? id(req.body.projectId) : null;
    const classification=await expenseClassification({...req.body,amountCents,expenseDate});
    const data = { ...classification, requestId, amountCents, category, expenseDate, description, project, payee: text(req.body.payee, 120), reference: text(req.body.reference, 120) };
    const old = await Expense.findOne({ requestId }).lean();
    if (old) {
      const comparable={...old,fundingAccount:physicalFunding(old.method,old.fundingAccount),payoutLinkChecked:!!old.payoutLinkChecked};
      if (Object.entries(data).some(([key, value]) => String(comparable[key] ?? "") !== String(value ?? ""))) fail(409, "This submission ID belongs to a different expense. Review the list.");
      return res.json({ success: true, data: old, message: "Expense already recorded. No duplicate created." });
    }
    if (project && !(await Project.exists({ _id: project, status: { $ne: "ARCHIVED" } }))) fail(409, "Choose a project that is not archived.");
    await Expense.init();
    const expense = await Expense.create({ ...data, expenseId: await generateRecordId("expense"), createdBy: req.user._id });
    await logActivity({ action: "EXPENSE_RECORDED", req, userId: req.user._id, entityType: "Expense", entityId: expense._id, metadata: { amountCents, category } });
    res.status(201).json({ success: true, data: expense, message: "Expense recorded." });
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ success: false, message: "This expense may already be recorded. Refresh the list before retrying." });
    next(e);
  }
}
export async function report(req, res, next) {
  try {
    const { from, to } = dateRange(req.query), project = req.query.project ? id(req.query.project) : null;
    const [allPayments, allExpenses, accounts] = await Promise.all([paymentRows(), Expense.find().populate("project", "projectId projectName projectCode").populate("createdBy","username").lean(), populate(PropertyAssignment.find(project ? { project } : {})).lean()]);
    const payments = allPayments.filter(p => p.posted!==false && p.paymentDate >= from && p.paymentDate <= to && (!project || String(p.project?._id) === project));
    const expenses = allExpenses.filter(e => isPosted(e) && e.expenseDate >= from && e.expenseDate <= to && (!project || String(e.project?._id) === project));
    const collectedCents = payments.reduce((n, p) => n + p.amountCents, 0), expenseCents = expenses.reduce((n, e) => n + e.amountCents, 0);
    const asOf = to < today() ? to : today();
    const balances = accounts.filter(a => a.contract.contractDate <= asOf).map(a => ({ ...accountData(a, req.user), summary: summarizeAccount(a, asOf) }));
    res.json({ success: true, data: { from, to, asOf, collectedCents, expenseCents, netCents: collectedCents - expenseCents, payments, expenses, accounts: balances, monitoringReports:monitoringReports(accounts.filter(a=>a.contract.contractDate<=asOf),from,to,asOf) } });
  } catch (e) { next(e); }
}

export async function updateAgreement(req, res, next) {
  try {
    const accountId = id(req.params.id);
    if (req.body.confirmScheduleReplacement !== true || !Number.isSafeInteger(req.body.expectedVersion) || req.body.expectedVersion < 0) fail(400, "Review and explicitly confirm the replacement schedule before saving.");
    const account = await PropertyAssignment.findById(accountId).lean();
    if (!account) fail(404, "Account not found.");
    const project = await Project.findById(account.project);
    if (!project || project.status === "ARCHIVED") fail(409, "Archived project agreements cannot be changed.");
    const months = Number(req.body.months), downPaymentCents = moneyCents(req.body.downPayment);
    const monitoringTerms=req.body.monitoringTerms===undefined?account.contract.monitoringTerms:validateTerms(req.body.monitoringTerms,account.contract.contractDate);
    if(account.contract.monitoringTerms && !monitoringTerms)fail(400,"Disable penalties through a preserved terms revision rather than removing configured terms.");
    if(monitoringTerms&&String(req.body.reason||"").trim().length<5)fail(400,"Enter a reason for changing contractual terms.");
    if(monitoringTerms&&req.body.monthlyInstallment!==undefined)validateMonthlyArrangement(account.contract.totalCents,downPaymentCents,months,req.body.monthlyInstallment,req.body.monthlyOverrideAcknowledged);
    const schedule=configureSchedule(buildSchedule(account.contract.totalCents,months,req.body.firstDueDate,downPaymentCents,account.contract.contractDate),monitoringTerms,req.body.monthlyInstallment??(account.contract.monthlyInstallmentCents/100));
    if(schedule.some(s=>s.dueDate<account.contract.contractDate))fail(400,"Due day cannot move an installment before the contract date.");
    const contract = { ...account.contract, monitoringTerms, monthlyInstallmentCents:schedule.find(s=>s.installment>0)?.amountCents, months, termType: req.body.termType === "CUSTOM" || !TERMS.includes(months) ? "CUSTOM" : "PREDEFINED", downPaymentCents, firstDueDate:schedule.find(s=>s.installment>0)?.dueDate||req.body.firstDueDate, schedule };
    allocatePayments({...account,contract});
    const event = { eventId: req.auditEvent?._id, action: "AGREEMENT_UPDATED", userId: req.user._id, username: req.user.username, role: req.user.role, timestamp: new Date(), previousValues: account.contract, updatedValues: contract };
    const update=attachMonitoringUpdate({...account,contract,agreementHistory:[...(account.agreementHistory||[]),{contract:account.contract,replacedAt:event.timestamp}]}, {
      $set: Object.fromEntries(["months","termType","downPaymentCents","firstDueDate","schedule","monitoringTerms","monthlyInstallmentCents"].map(k=>[`contract.${k}`,contract[k]])), $push: { agreementHistory: { contract: account.contract, replacedAt: event.timestamp, replacedBy: req.user._id }, auditEvents: event }, $inc: { __v: 1 }
    },{userId:req.user._id,username:req.user.username,role:req.user.role},String(req.body.reason||"Agreement updated"));
    const updated=await PropertyAssignment.findOneAndUpdate({_id:accountId,__v:req.body.expectedVersion},update,{new:true,runValidators:true}).lean();
    if (!updated) fail(409, "This account or its payments changed. Reload and review the agreement before retrying.");
    await logActivity({ action: "AGREEMENT_UPDATED", req, userId: req.user._id, entityType: "PropertyAssignment", entityId: accountId });
    res.json({ success: true, message: "Agreement updated. Previous schedule preserved; recorded payments are unchanged.", data: accountData(updated,req.user) });
  } catch (e) { next(e); }
}

export async function previewPayment(req,res,next){
 try{
  const account=await PropertyAssignment.findById(id(req.body.accountId)).lean();if(!account)fail(404,"Account not found.");
  const amountCents=moneyCents(req.body.amount),paymentDate=req.body.paymentDate,type=req.body.type||"AUTO";
  if(!amountCents||!validDate(paymentDate)||paymentDate<account.contract.contractDate||paymentDate>today()||!["AUTO","DOWN_PAYMENT","INSTALLMENT","PENALTY"].includes(type))fail(400,"Check the payment amount, date and type.");
  validateReceipt(req.body.receiptNumber);await checkReceipt(req.body.receiptNumber,receiptScope(),account._id,"PREVIEW",req.body.requestId);
  const fundingAccount=validateFunding(req.body.method,req.body.fundingAccount);
  const configuration=paymentConfiguration(req.body.configuration,req.user);
  if(needsAllocationChoice(account,{paymentDate,type,configuration}))fail(400,"This payment has both outstanding principal and penalties. Choose its allocation priority or an explicit payment type, then review the allocation.");
  const proposed={...account,payments:[...account.payments,{paymentId:"PREVIEW",amountCents,paymentDate,type,configuration,fundingAccount,createdAt:new Date()}]};
  res.json({success:true,data:allocationPreview(account,proposed,"PREVIEW")});
 }catch(e){next(e)}
}

export async function exportMonitoringReport(req,res,next){
 try{
  const {from,to}=dateRange(req.query),filter=req.query.project?{project:id(req.query.project)}:{};
  const accounts=await populate(PropertyAssignment.find(filter)).lean(),asOf=to<today()?to:today();
  const rows=monitoringReports(accounts.filter(a=>a.contract.contractDate<=asOf),from,to,asOf),brand=await reportIdentity(req.query.project||accounts.map(a=>a.project?._id).filter(Boolean));
  const {default:ExcelJS}=await import("exceljs");const workbook=new ExcelJS.Workbook();
  for(const [name,entries]of Object.entries(rows)){const sheet=workbook.addWorksheet(name);sheet.addRow([brand.companyName]);sheet.addRow([`Monitoring ${from} to ${to}`]);sheet.addRow(reportColumns);brandExcel(workbook,sheet,brand);for(const row of entries)sheet.addRow(reportRow(row));sheet.getRow(1).font={bold:true};sheet.getRow(3).font={bold:true};sheet.columns.forEach(c=>c.width=24)}
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");res.setHeader("Content-Disposition",`attachment; filename="payment-monitoring-${from}-${to}.xlsx"`);res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
 }catch(e){next(e)}
}

export async function exportPaymentRegister(req,res,next){
 try {
  const {from,to}=dateRange(req.query),project=req.query.project?id(req.query.project):null;
  const accounts=await populate(PropertyAssignment.find(project?{project}:{})).lean();
  const agentIds=[...new Set(accounts.flatMap(a=>a.commissionAgreement?.agents?.map(r=>String(r.agent))||[]))].filter(mongoose.isValidObjectId),agents=Object.fromEntries((await Agent.find({_id:{$in:agentIds}}).select('fullName').lean()).map(a=>[String(a._id),a.fullName]));
  const options={agents,...await reportIdentity(project||accounts.filter(a=>a.payments.some(p=>p.paymentDate>=from&&p.paymentDate<=to)).map(a=>a.project?._id).filter(Boolean))},data=registerData(accounts,from,to,options);
  const snapshot=createHash('sha256').update(JSON.stringify({from,to,project,rows:data.rows,commissionRows:data.commissionRows,companyIdentity:options.companyIdentity})).digest('hex');
  if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==snapshot)fail(409,'Register changed. Refresh the preview before printing or exporting.');
  if(!req.path.endsWith('.xlsx')){
   const page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1)fail(400,'Invalid preview page.');
   return res.json({success:true,data:{...data,...options,title:'Payment–Commission Register',from,to,generatedOn:today(),snapshot,page,filters:{from,to,project:project||'All'},rows:req.query.all==='1'?data.rows:data.rows.slice((page-1)*20,page*20)}});
  }
  const workbook=paymentRegisterWorkbook(accounts,from,to,options);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename="payment-commission-register-${from}-${to}.xlsx"`);
  res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
 }catch(e){next(e)}
}

export async function dashboardAnalytics(req,res,next){
 try{
  const {from,to}=dateRange(req.query),filter=req.query.project?{project:id(req.query.project)}:{};
  const [accounts,expenses]=await Promise.all([PropertyAssignment.find(filter).select("payments").lean(),Expense.find({...filter,expenseDate:{$gte:from,$lte:to}}).select("amountCents expenseDate").lean()]);
  res.json({success:true,data:{from,to,months:dashboardCharts(accounts,expenses,from,to)}});
 }catch(e){next(e)}
}

export function paymentConfiguration(input,user){
 if(input==null)return {};
 if(typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(k=>!["allocationPriority","reason"].includes(k)))fail(400,"Only supported transaction allocation priority may be overridden here. Use the explicit agreement editor or administrator waiver for penalty changes.");
 if(Object.keys(input).length===0)return {};
 if(!["ADMIN","STAFF"].includes(user?.role)||!["PRINCIPAL_FIRST","PENALTY_FIRST"].includes(input.allocationPriority)||typeof input.reason!=="string"||input.reason.trim().length<5||input.reason.length>500)fail(400,"Choose a valid payment priority and give an override reason (5–500 characters).");
 return {allocationPriority:input.allocationPriority,reason:input.reason.trim()};
}

export async function getPaymentContext(req,res,next){try{const a=await PropertyAssignment.findById(id(req.query.accountId)).lean(),date=req.query.date;if(!a)fail(404,'Account not found.');if(!validDate(date)||date<a.contract.contractDate||date>today())fail(400,'Choose a valid payment date.');res.json({success:true,data:paymentContext(a,date)})}catch(e){next(e)}}
