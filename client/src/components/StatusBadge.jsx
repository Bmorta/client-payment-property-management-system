const STATUS_CLASSES = {
 UPDATED:'text-bg-success',ADVANCE_PAID:'text-bg-info',PAID_IN_ADVANCE:'text-bg-info',
 EXPIRED:'text-bg-danger',EXPIRING_SOON:'text-bg-warning',CONVERTED:'text-bg-success',PROSPECT:'text-bg-info',
 INSTALLMENT:'text-bg-info',REQUIRES_REVIEW:'text-bg-warning',RESTRICTED:'text-bg-secondary',PARTIAL:'text-bg-warning',DUE:'text-bg-warning',

 CANCELLED:'text-bg-danger',FORFEITED:'text-bg-danger',SUPERSEDED:'text-bg-secondary',TRANSFERRED:'text-bg-info',ASSUMED:'text-bg-info',CANCELLATION_REVIEW:'text-bg-warning',FULLY_PAID:'text-bg-success',PRINCIPAL_FULLY_PAID:'text-bg-success',SETTLED:'text-bg-success',APPROVED_PENDING:'text-bg-warning',NEW:'text-bg-info',SCHEDULED:'text-bg-info',IN_PROGRESS:'text-bg-warning',
 CURRENT_PENALTY:'status-orange',CURRENT_PENALTY_SETTLED:'text-bg-success',NO_CURRENT_PENALTY:'text-bg-success',CURRENT:'text-bg-success',NO_OUTSTANDING_PENALTY:'text-bg-success',PAID:'text-bg-success',DUE_SOON:'text-bg-warning',UPCOMING_DUE:'text-bg-warning',DUE_TODAY:'text-bg-warning',WITHIN_GRACE_PERIOD:'text-bg-warning',
 OVERDUE:'status-orange',PENALTY_ACCRUING:'status-orange',ACCRUING:'status-orange',UNPAID:'status-orange',UNPAID_PENALTIES:'status-orange',PARTIALLY_PAID:'text-bg-warning',WAIVED_OR_SETTLED:'text-bg-secondary',
 CRITICAL:'text-bg-danger',CRITICAL_FORFEITURE_RISK:'text-bg-danger',FORFEITURE_REVIEW_REQUIRED:'text-bg-danger',PRINCIPAL_SETTLED_PENALTY_UNPAID:'status-orange',

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

const STATUS_LABELS={UPDATED:"Updated",ADVANCE_PAID:"Advance Paid",PAID_IN_ADVANCE:"Advance Paid",FULLY_PAID:"Fully Paid",DUE_TODAY:"Due Today",DUE_SOON:"Due Soon",OVERDUE:"Overdue",REQUIRES_REVIEW:"Requires Review",FOR_ASSUME:"For Assume",PROSPECT:"Prospect"};

export default function StatusBadge({ status, label }) {
  return <span className={`badge rems-status-badge ${STATUS_CLASSES[status] || "text-bg-secondary"}`}>
    {label || STATUS_LABELS[status] || status?.replaceAll("_"," ") || "Unknown"}
  </span>;
}
