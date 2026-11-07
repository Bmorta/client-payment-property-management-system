import CashLedgerEntry from "../models/CashLedgerEntry.js";
import Agent from "../models/Agent.js";
import ActivityLog from "../models/ActivityLog.js";
import Project from "../models/Project.js";
import Phase from "../models/Phase.js";
import Block from "../models/Block.js";
import Property from "../models/Property.js";
import Client from "../models/Client.js";
import User from "../models/User.js";
import PropertyAssignment from "../models/PropertyAssignment.js";
import Expense from "../models/Expense.js";
import { actorSnapshot, auditValues } from "../utils/auditValues.js";

function target(req) {
  const parts = req.path.split("/").filter(Boolean), base = req.baseUrl;
  let model, module, filter = {};
  const one = id => /^[a-fA-F0-9]{24}$/.test(String(id || "")) ? { _id: id } : { _id: null };
  if (base.endsWith("/agents")){model=Agent;module="Agents";filter=one(parts[0]);}
  if (base.endsWith("/commissions")){model=PropertyAssignment;module="Commissions";filter=one(parts[1]);}
  if (base.endsWith("/users")) { model = User; module = "Users"; filter = one(parts[0]); }
  if (base.endsWith("/clients")) {
    model = parts.includes("assignments") ? Property : Client; module = parts.includes("assignments") ? "Payment Agreements" : "Clients";
    filter = one(parts.includes("assignments") ? req.body?.propertyId : parts[0]);
  }
  if (base.endsWith("/projects")) {
    const kind = parts[1];
    model = kind === "phases" ? Phase : kind === "blocks" ? Block : kind === "properties" ? Property : Project;
    module = kind === "phases" ? "Phases" : kind === "blocks" ? "Blocks" : kind === "properties" ? "Lots" : "Projects";
    filter = one(kind ? parts[2] : parts[0]);
    if (kind === "properties" && ["batch", "bulk-delete"].includes(parts[2])) filter = { project: parts[0], _id: { $in: req.body?.ids || req.body?.updates?.map(p => p._id) || [] } };
    if (kind === "properties" && parts[2] === "generate") {
      const locations = (Array.isArray(req.body?.phases) ? req.body.phases : []).flatMap(p => (Array.isArray(p.blocks) ? p.blocks : []).map(b => ({ phaseNumber: p.phaseNumber, blockNumber: b.blockNumber })));
      filter = locations.length ? { project: parts[0], $or: locations } : { _id: null };
    }
    if (kind && !["phases", "blocks", "properties"].includes(kind)) filter = one(parts[0]);
  }
  if (base.endsWith("/finance")) {
    model = parts[0] === "cash-ledger" ? CashLedgerEntry : parts[0] === "expenses" ? Expense : PropertyAssignment;
    module = parts[0] === "cash-ledger" ? "Cash Ledger" : parts.includes("corrections") || parts.includes("requests") ? "Payment Corrections" : parts[0] === "notifications" ? "Notifications" : parts[0] === "expenses" ? "Expenses" : parts[0] === "accounts" ? "Payment Agreements" : "Payment Transactions";
    filter = one(["accounts","expenses","cash-ledger"].includes(parts[0]) ? parts[1] : req.body?.accountId);
  }
  const action = req.path.endsWith("/archive") ? "ARCHIVED" : req.method === "DELETE" || req.path.endsWith("/bulk-delete") ? "DELETED" : req.method === "POST" ? "CREATED" : "UPDATED";
  return { model, module, filter, action };
}
// Durable write-ahead journal: no mutation starts unless its intent and before
// snapshot are saved. A crash leaves PENDING, never a falsely successful entry.
// Critical account edits/payment appends also carry audit data in the same
// MongoDB document update (the standalone-office equivalent of an audit outbox).
export async function auditMutation(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  let event;
  try {
    const info = target(req);
    if (!info.model) return next();
    const previous = await info.model.find(info.filter).lean();
    const recordId = typeof info.filter._id === "object" ? info.filter._id?.$in?.join(", ") || "" : info.filter._id || "";
    event = await ActivityLog.create({ ...actorSnapshot(req.user), module: info.module, action: info.action, entityType: info.model.modelName,
      entityId: String(req.params?.id || recordId), outcome: "PENDING", previousValues: auditValues(previous),
      metadata: { requestedValues: auditValues(req.body) }, description: `${req.user.username} requested ${info.action.toLowerCase()} in ${info.module}` });
    req.auditEvent = event;
    const original = res.json.bind(res);
    res.json = body => {
      res.json = original;
      const succeeded = res.statusCode < 400 && body?.success !== false;
      const finish = async () => {
        let after = body?.data;
        if (req.method !== "DELETE" && info.filter._id !== null && info.action !== "DELETED") {
          // Batch mutations often return counts rather than documents.
          const current = await info.model.find(info.filter).lean();
          if (current.length) after = current;
        }
        await ActivityLog.updateOne({ _id: event._id, outcome: "PENDING" }, { $set: {
          outcome: succeeded ? "SUCCEEDED" : "FAILED", completedAt: new Date(), updatedValues: auditValues(after ?? body),
          entityId: String(body?.data?._id || (Array.isArray(body?.data) ? body.data.map(p => p.propertyId || p.phaseId || p.blockId || p._id).filter(Boolean).join(", ") : "") || recordId || event.entityId || ""),
          description: `${req.user.username}: ${info.action.toLowerCase()} in ${info.module} — ${body?.message || (succeeded ? "Completed" : "Request failed; review for partial changes")}`,
          metadata: auditValues({ requestedValues: req.body, details: req.auditDetails || {}, responseMessage: body?.message })
        } });
        return original(body);
      };
      return finish().catch(() => {
        const auditWarning = "The durable audit entry is pending completion. An administrator can review it in User Activity Logs.";
        return original({ ...body, message: `${body?.message || "Request processed."} ${auditWarning}`, auditWarning });
      });
    };
    next();
  } catch (error) {
    if (!event) return res.status(503).json({ success: false, message: "Audit storage is unavailable. No change was started. Please retry later." });
    next(error);
  }
}
