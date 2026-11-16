const secret = /password|token|secret|authorization|cookie|salt|credential|hash|^base64$/i;
export function auditValues(value, depth = 0) {
  if (depth > 12) return "[depth limit]";
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toHexString === "function") return value.toHexString();
  if (typeof value.toObject === "function") value = value.toObject();
  if (Array.isArray(value)) return value.map(item => auditValues(item, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !secret.test(key)).map(([key, item]) => [key, auditValues(item, depth + 1)]));
}
export const actorSnapshot = user => ({ userId: user?._id, username: user?.username || "", userRole: user?.role || "", fullName: user?.fullName || [user?.firstName,user?.middleName,user?.lastName,user?.suffix].filter(Boolean).join(" ") });

export const reviewActor = user => {const a=actorSnapshot(user);return {userId:a.userId,username:a.username,fullName:a.fullName,role:a.userRole}};
