import mongoose from "mongoose";
import PropertyAssignment from "../models/PropertyAssignment.js";
import Property from "../models/Property.js";
import Client from "../models/Client.js";
import Project from "../models/Project.js";
import Expense from "../models/Expense.js";
import { lotPrice } from "../utils/lotPricing.js";
import { moneyCents, buildSchedule, summarizeAccount, validDate, dateRange, today, METHODS } from "../utils/accounting.js";
import { generateRecordId } from "../utils/generateRecordId.js";
import { logActivity } from "../utils/activityLogger.js";
const fail = (code, message) => { throw Object.assign(new Error(message), { statusCode: code }); };
const id = value => { if (typeof value !== "string" || !mongoose.isValidObjectId(value)) fail(400, "Invalid identifier."); return value; };
const text = (value, max = 500) => { if (value != null && typeof value !== "string") fail(400, "Invalid text field."); return (value || "").trim().slice(0, max); };
const requestKey = value => { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(value)) fail(400, "Invalid submission ID. Reload the form."); return value; };
const populate = query => query.populate("client", "clientId firstName middleName lastName suffix").populate("project", "projectName projectCode").populate("property", "propertyId phaseNumber blockNumber lotNumber areaSqm");
const accountData = account => ({ ...account, summary: summarizeAccount(account) });
export async function listAccounts(req, res, next) {
  try {
    const filter = req.query.client ? { client: id(req.query.client) } : {};
    const accounts = await populate(PropertyAssignment.find(filter)).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: accounts.map(accountData) });
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
    const project = await Project.findById(property.project);
    if (!project || project.status === "ARCHIVED") fail(409, "This project cannot accept assignments.");
    if ((req.body.expectedAreaSqm !== undefined && req.body.expectedAreaSqm !== property.areaSqm) || (req.body.expectedPricePerSqm !== undefined && req.body.expectedPricePerSqm !== property.pricePerSqm)) fail(409, "This lot's area or price changed. Refresh and review the new price before assigning.");
    const total = lotPrice(property.areaSqm, property.pricePerSqm);
    if (total == null || total <= 0) fail(400, "Set this lot's area and price per sqm before assigning it.");
    const totalCents = moneyCents(total), months = Number(req.body.months);
    const firstDueDate = req.body.firstDueDate, contractDate = req.body.contractDate;
    const downPaymentCents = moneyCents(req.body.downPayment || 0);
    if (contractDate > today()) fail(400, "Contract date cannot be in the future.");
    const schedule = buildSchedule(totalCents, months, firstDueDate, downPaymentCents, contractDate);
    if (await PropertyAssignment.exists({ property: propertyId })) fail(409, "This lot already has an account. Use that account instead.");
    await PropertyAssignment.init();
    claimed = await Property.findOneAndUpdate({ _id: propertyId, areaSqm: property.areaSqm, pricePerSqm: property.pricePerSqm, $or: [{ client: null, status: "AVAILABLE" }, { client: clientId, status: "RESERVED" }] }, { $set: { client: clientId, status: "RESERVED" } }, { new: true });
    if (!claimed) fail(409, "This lot is no longer available or is already linked to a client.");
    created = await PropertyAssignment.create({ assignmentId: await generateRecordId("contract"), client: clientId, project: property.project, property: propertyId,
      contract: { totalCents, months, firstDueDate, contractDate, downPaymentCents, areaSqm: property.areaSqm, pricePerSqm: property.pricePerSqm, schedule }, createdBy: req.user._id });
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
const samePayment = (p, input) => p.amountCents === input.amountCents && p.paymentDate === input.paymentDate && p.method === input.method && p.reference === input.reference && p.notes === input.notes;
export async function acceptPayment(req, res, next) {
  try {
    const accountId = id(req.body.accountId), requestId = requestKey(req.body.requestId);
    const amountCents = moneyCents(req.body.amount), paymentDate = req.body.paymentDate;
    if (!amountCents || !validDate(paymentDate) || paymentDate > today() || !METHODS.includes(req.body.method)) fail(400, "Enter a positive payment, valid date and payment method.");
    const input = { amountCents, paymentDate, method: req.body.method, reference: text(req.body.reference, 120), notes: text(req.body.notes) };
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
    const payment = { ...input, requestId, paymentId: await generateRecordId("payment"), createdBy: req.user._id, createdAt: new Date() };
    account = await PropertyAssignment.findOneAndUpdate({ _id: accountId, "payments.requestId": { $ne: requestId },
      $expr: { $lte: [{ $add: [{ $sum: "$payments.amountCents" }, amountCents] }, "$contract.totalCents"] }
    }, { $push: { payments: payment } }, { new: true, runValidators: true }).lean();
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
  return accounts.flatMap(account => account.payments.map(payment => ({ ...payment, accountId: account._id, assignmentId: account.assignmentId, client: account.client, project: account.project, property: account.property })))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
export async function listPayments(req, res, next) {
  try { res.json({ success: true, data: await paymentRows() }); } catch (e) { next(e); }
}
export async function listExpenses(req, res, next) {
  try { res.json({ success: true, data: await Expense.find().populate("project", "projectName projectCode").sort({ expenseDate: -1, createdAt: -1 }).lean() }); } catch (e) { next(e); }
}
export async function createExpense(req, res, next) {
  try {
    const requestId = requestKey(req.body.requestId), amountCents = moneyCents(req.body.amount);
    const { category, expenseDate } = req.body;
    const description = text(req.body.description);
    if (!amountCents || !description || !["OFFICE", "PROJECT", "OTHER"].includes(category) || !validDate(expenseDate) || expenseDate > today()) fail(400, "Enter a positive amount, description, category and valid expense date.");
    const project = category === "PROJECT" ? id(req.body.projectId) : null;
    const data = { requestId, amountCents, category, expenseDate, description, project, payee: text(req.body.payee, 120), reference: text(req.body.reference, 120) };
    const old = await Expense.findOne({ requestId }).lean();
    if (old) {
      if (Object.entries(data).some(([key, value]) => String(old[key] ?? "") !== String(value ?? ""))) fail(409, "This submission ID belongs to a different expense. Review the list.");
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
    const [allPayments, allExpenses, accounts] = await Promise.all([paymentRows(), Expense.find().populate("project", "projectName projectCode").lean(), populate(PropertyAssignment.find(project ? { project } : {})).lean()]);
    const payments = allPayments.filter(p => p.paymentDate >= from && p.paymentDate <= to && (!project || String(p.project?._id) === project));
    const expenses = allExpenses.filter(e => e.expenseDate >= from && e.expenseDate <= to && (!project || String(e.project?._id) === project));
    const collectedCents = payments.reduce((n, p) => n + p.amountCents, 0), expenseCents = expenses.reduce((n, e) => n + e.amountCents, 0);
    const asOf = to < today() ? to : today();
    const balances = accounts.filter(a => a.contract.contractDate <= asOf).map(a => ({ ...a, summary: summarizeAccount(a, asOf) }));
    res.json({ success: true, data: { from, to, asOf, collectedCents, expenseCents, netCents: collectedCents - expenseCents, payments, expenses, accounts: balances } });
  } catch (e) { next(e); }
}
