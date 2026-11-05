const STATUS_CLASSES = {
  UNRELEASED:"text-bg-warning",PARTIALLY_RELEASED:"text-bg-info",RELEASED:"text-bg-success",AWAITING_BUYER_PAYMENT:"text-bg-secondary",ADJUSTED_REVERSED:"text-bg-danger",
  VALID:"text-bg-success",CORRECTED:"text-bg-info",VOIDED:"text-bg-secondary",PENDING:"text-bg-warning",APPROVED:"text-bg-success",REJECTED:"text-bg-danger",STALE:"text-bg-danger",
  AVAILABLE: "text-bg-success",
  SOLD: "text-bg-danger",
  FOR_ASSUME: "text-bg-info",
  RESERVED: "text-bg-warning",
  ARCHIVED: "text-bg-danger",
  INACTIVE: "text-bg-danger",
  ACTIVE: "text-bg-success",
  PLANNING: "text-bg-secondary",
  COMPLETED: "text-bg-success",
  UNAVAILABLE: "text-bg-danger"
};

export default function StatusBadge({ status, label }) {
  return <span className={`badge ${STATUS_CLASSES[status] || "text-bg-secondary"}`}>
    {label || (status === "FOR_ASSUME" ? "For Assume" : status || "Unknown")}
  </span>;
}
