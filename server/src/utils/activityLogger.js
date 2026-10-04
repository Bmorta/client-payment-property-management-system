import ActivityLog from "../models/ActivityLog.js";

export const logActivity = async ({
  action,
  req,
  userId = null,
  entityType = null,
  entityId = null,
  metadata = {}
}) => {
  try {
    await ActivityLog.create({
      action,
      userId,
      entityType,
      entityId,
      metadata,
      ipAddress: req?.ip || null,
      userAgent: req?.get("user-agent") || null
    });
  } catch (error) {
    console.error("Activity log failed:", error.message);
  }
};
