import {configureSchedule,validateTerms} from "../../../shared/contractTerms.js";
import { buildSchedule, moneyCents, validDate } from "../../../shared/paymentSchedule.js";
import { pesos } from "../utils/finance.js";
export default function PaymentEstimate({ totalCents, months, downPayment, firstDueDate, contractDate, propertyLabel = "", termType = "PREDEFINED", monitoringTerms=null, monthlyInstallment }) {
  let schedule = [], down = 0, error = "";
  if (totalCents != null) {
    try {
      down = moneyCents(downPayment);
      schedule = configureSchedule(buildSchedule(totalCents, Number(months), firstDueDate || contractDate, down, contractDate),validateTerms(monitoringTerms,contractDate),monthlyInstallment);
    } catch (e) { error = e.message; }
  }
  const installments = schedule.filter(row => row.installment > 0);
  const datesReady = validDate(firstDueDate) && validDate(contractDate) && firstDueDate >= contractDate;
  const first = installments[0], last = installments.at(-1);
  const financed = totalCents == null ? null : totalCents - down;
  let remaining = financed;
  return <section className="border rounded bg-body-tertiary p-3 my-3" aria-label="Estimated Payment Summary">
    <h3 className="h6 fw-bold text-uppercase">Estimated Payment Summary</h3>
    {totalCents == null ? <p className="text-secondary mb-0">Select a lot with a selling price to preview installments.</p> : <>
      {propertyLabel && <p className="small mb-2">Selected Property: {propertyLabel}</p>}
      <dl className="row small mb-1"><dt className="col-sm-6">Original TCP (Before DP)</dt><dd className="col-sm-6">{pesos(totalCents)}</dd><dt className="col-sm-6">Agreed Down Payment</dt><dd className="col-sm-6">{pesos(down)}</dd>
        <dt className="col-sm-6">TCP (After Down Payment)</dt><dd className="col-sm-6">{error ? "—" : pesos(financed)}</dd><dt className="col-sm-6">Payment Term</dt><dd className="col-sm-6">{termType === "CUSTOM" ? "Custom Term: " : ""}{months || "—"} months</dd></dl>
      {error ? <p className="text-danger small mb-1" role="status">{error} Enter a whole number from 1 to 1,200 months and valid dates.</p> : <>
        <p className="mb-1">Estimated Monthly Installment</p><p className="fs-4 fw-bold mb-2" aria-label="Estimated monthly installment">{pesos(first.amountCents)}{last.amountCents !== first.amountCents && <span className="fs-6 fw-normal"> (final installment {pesos(last.amountCents)})</span>}</p>
        <p className="small mb-2">First Payment: {datesReady ? first.dueDate : "Choose payment start date"} · Final Payment: {datesReady ? last.dueDate : "—"}</p>
        {datesReady && <details><summary>View Estimated Payment Schedule</summary><div className="table-responsive mt-2"><table className="table table-sm"><thead><tr><th>Month</th><th>Due Date</th><th>Installment</th><th>Remaining Installment Principal</th></tr></thead><tbody>{installments.map(row => { remaining -= row.amountCents; return <tr key={row.installment}><td>{row.installment}</td><td>{row.dueDate}</td><td>{pesos(row.amountCents)}</td><td>{pesos(remaining)}</td></tr>; })}</tbody></table></div></details>}
      </>}
      <p className="small text-secondary mt-2 mb-0">Estimate only until the agreement is saved. No payment is recorded. Interest and penalties are not added.</p>
    </>}
  </section>;
}
