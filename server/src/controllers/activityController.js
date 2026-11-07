import ActivityLog from "../models/ActivityLog.js";
import { validDate } from "../utils/accounting.js";
import { auditValues } from "../utils/auditValues.js";
import mongoose from "mongoose";
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export async function listActivity(req, res, next) {
  try {
    const { user, module, action, from, to } = req.query;
    const page = Number(req.query.page || 1), limit = Math.min(Number(req.query.limit || 20), 100);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || (user && !mongoose.isValidObjectId(user)) || (from && !validDate(from)) || (to && !validDate(to)) || (from && to && from > to)) return res.status(400).json({ success: false, message: "Invalid log filters or pagination." });
    if ([user, module, action, from, to, req.query.q].some(value => value !== undefined && (typeof value !== "string" || value.length > 100))) return res.status(400).json({ success: false, message: "Invalid log filter." });
    const filter = { ...(user ? { userId: user } : {}), ...(module ? { module } : {}), ...(action ? { action } : {}) };
    const legacyActions = { CREATED: ["CREATED","PROJECT_CREATED","CLIENT_CREATED","USER_CREATION","PROPERTY_ASSIGNED","PAYMENT_RECORDED","EXPENSE_RECORDED"], UPDATED: ["UPDATED","PROJECT_UPDATED","CLIENT_UPDATED","USER_UPDATE","AGREEMENT_UPDATED"], ARCHIVED: ["ARCHIVED","PROJECT_ARCHIVED"] };
    if (legacyActions[action]) filter.action = { $in: legacyActions[action] };
    if (from || to) filter.createdAt = { ...(from ? { $gte: new Date(`${from}T00:00:00+08:00`) } : {}), ...(to ? { $lte: new Date(`${to}T23:59:59.999+08:00`) } : {}) };
    if (req.query.q) {
      const pattern = new RegExp(escape(String(req.query.q).slice(0,100)), "i");
      filter.$or = ["username", "description", "entityId", "action", "entityType"].map(key => ({ [key]: pattern }));
    }
    const [total, rows] = await Promise.all([ActivityLog.countDocuments(filter), ActivityLog.find(filter).populate("userId", "username").sort({ createdAt: -1, _id: -1 }).skip(req.listExport?0:(page-1)*limit).limit(req.listExport?0:limit).lean()]);
    res.json({ success: true, data: auditValues(rows), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total/limit)) } });
  } catch (e) { next(e); }
}
