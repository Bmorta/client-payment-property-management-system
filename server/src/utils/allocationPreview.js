import {createHash} from "node:crypto";
import {allocatePayments} from "./paymentLedger.js";
import {today} from "./accounting.js";
export function allocationPreview(account,proposed,paymentId){
 const before=allocatePayments(account),after=allocatePayments(proposed),rows=after.allocations[paymentId]||[];
 const preview={allocations:rows,fullyCoveredInstallments:after.schedule.filter(s=>s.installment>0&&s.balanceCents===0&&before.schedule.find(b=>b.installmentId===s.installmentId)?.balanceCents>0).length,
  advanceMonths:after.schedule.filter(s=>s.installment>0&&s.balanceCents===0&&rows.some(r=>r.installmentId===s.installmentId&&r.allocationType==="ADVANCE")).length,
  partialInstallments:after.schedule.filter(s=>s.paidCents>0&&s.balanceCents>0),nextUnpaidDueDate:after.nextUnpaidDueDate,remainingContractBalanceCents:after.balanceCents,
  outstandingPenaltyCents:before.outstandingPenaltyCents,remainingPenaltyCents:after.outstandingPenaltyCents,
  overdueInstallments:before.schedule.filter(s=>s.overdue),riskStatus:after.riskStatus,affectedAllocations:after.allocations};
 const token=createHash("sha256").update(JSON.stringify({version:account.__v??0,asOf:today(),preview})).digest("hex");
 return {...preview,token,version:account.__v??0};
}
