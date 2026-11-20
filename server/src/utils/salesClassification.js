export const closedSaleLifecycles=new Set(['TRANSFERRED','ASSUMED','CANCELLED','FORFEITED','SUPERSEDED']);
export const recordId=value=>String(value?._id||value||'');
export const recordedSaleAccount=a=>!!a&&!a.voided&&!a.contract?.voided&&!['VOIDED','REVERSED','DRAFT','PENDING'].includes(a.status||a.contract?.status)&&a.migration?.status!=='DRAFT';
export const validSaleAccount=a=>recordedSaleAccount(a)&&!closedSaleLifecycles.has(a.lifecycle)&&!['CANCELLED'].includes(a.status||a.contract?.status)&&!['CANCELLED','FORFEITED','TRANSFERRED','ASSUMED'].includes(a.migration?.historicalStatus);
export const originalSale=a=>!a.transferIn&&!a.assumptionIn&&!a.reactivationIn;
export const originalContract=a=>a.financialCorrections?.[0]?.currentContract||a.agreementHistory?.[0]?.contract||a.contract;
export const initialCommissionAgreement=a=>a.commissionAgreementHistory?.[0]?.previousValues?.agents?.length?a.commissionAgreementHistory[0].previousValues:a.commissionAgreementHistory?.find(h=>h.updatedValues?.agents?.length)?.updatedValues||a.commissionAgreement;
export const attributedSaleAgents=(a,reservation)=>[...new Set(a.salesAttribution?.shares?.length?a.salesAttribution.shares.map(x=>recordId(x.agentId)):reservation?.agent?[recordId(reservation.agent)]:(initialCommissionAgreement(a)?.agents||[]).map(x=>recordId(x.agent)).filter(Boolean))];
export function saleInventoryStatus(property,accounts,projectStatus){
 if(projectStatus==='ARCHIVED')return 'UNAVAILABLE';
 const valid=(accounts||[]).filter(validSaleAccount);
 if(!property.reservation&&valid.length===1&&(!property.client||recordId(property.client)===recordId(valid[0].client))&&['RESERVED','SOLD','AVAILABLE'].includes(property.status)&&(property.status!=='AVAILABLE'||property.client))return 'SOLD';
 if(property.status==='AVAILABLE'&&(valid.length||property.reservation))return 'UNAVAILABLE';
 return property.status;
}
