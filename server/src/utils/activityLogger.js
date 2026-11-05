import ActivityLog from "../models/ActivityLog.js";
import { actorSnapshot, auditValues } from "./auditValues.js";
export const logActivity = async ({ action, req, userId = null, entityType = null, entityId = null, metadata = {} }) => {
  if (req?.auditEvent) { req.auditDetails = { ...req.auditDetails, action, entityType, entityId, ...auditValues(metadata) }; return; }
  // Authentication events and legacy callers use the existing collection.
  // Errors propagate; they are no longer silently discarded.
  return ActivityLog.create({ ...actorSnapshot(req?.user), action, userId: userId || req?.user?._id,
    module: ["LOGIN", "LOGOUT"].includes(action) ? "Authentication" : entityType || "System", entityType, entityId,
    description: `${req?.user?.username || "User"}: ${action}`, metadata: auditValues(metadata), outcome: "SUCCEEDED",
    ipAddress: req?.ip || null, userAgent: req?.get?.("user-agent") || null });
};
