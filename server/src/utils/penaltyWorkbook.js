// Current calculations are account-level explanations. Monthly snapshots are
// deliberately excluded from financial totals; the explanation has its own sheet.
export function addCurrentPenaltyCalculations(book,accounts){
 const s=book.addWorksheet('Current Penalty Calculation');s.addRow(['Account','Rule','As Of','Overdue Months','Overdue Count','Current Gross PHP','Paid Applied PHP','Waived Applied PHP','Remaining PHP','Recorded Paid PHP','Recorded Waived PHP','Calculation','Review']);
 for(const r of accounts){const p=r.summary.currentPenaltySummary;s.addRow([r.assignmentId,r.summary.penaltyCalculationRule||'LEGACY_RECURRING',p?.asOf||'',p?.overdueInstallmentMonths.join(', ')||'',p?.overdueInstallments??'',p?p.grossCents/100:null,p?p.paidCents/100:null,p?p.waivedCents/100:null,p?p.remainingCents/100:r.summary.outstandingPenaltyCents/100,p?p.recordedPaidCents/100:null,p?p.recordedWaivedCents/100:null,p?.calculationLines.map(l=>l.formula).join('; ')||'Administrator conversion preview and approval required',p?.reviewIssues.join('; ')||'']);}
 s.addRow(['Historical monthly snapshots are not additional charges and are never added to these totals. Recorded payments and waivers remain in the audit history.']);s.columns.forEach((c,i)=>{c.width=i===11?85:25;if(i>=5&&i<=10)c.numFmt='"₱"#,##0.00'});s.views=[{state:'frozen',ySplit:1}];
}
