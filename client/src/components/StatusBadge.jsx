const STATUS_CLASSES = {
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

export default function StatusBadge({ status }) {
  return <span className={`badge ${STATUS_CLASSES[status] || "text-bg-secondary"}`}>
    {status === "FOR_ASSUME" ? "For Assume" : status || "Unknown"}
  </span>;
}
