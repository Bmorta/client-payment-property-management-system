// Operational penalty basis is saved from Payments, separately from contract terms.
export function penaltyPolicies(account){
 const base=[...(account.agreementHistory||[]).map(h=>h.contract?.monitoringTerms),account.contract.monitoringTerms].filter(Boolean);
 const choices=account.paymentPenaltyPolicies||[];
 return [...base,...choices.map(choice=>({...account.contract.monitoringTerms,...choice}))];
}
export function currentPenaltyPolicy(account){return penaltyPolicies(account).map((p,i)=>({...p,order:i})).sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate)||a.order-b.order).at(-1)||null}
