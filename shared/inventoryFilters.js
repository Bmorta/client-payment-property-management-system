export function filterInventory(rows,{phase='',block='',lot='',status='',q=''}={}){
 return rows.filter(p=>[p.propertyId,`Phase ${p.phaseNumber} Block ${p.blockNumber} Lot ${p.lotNumber}`,p.status,p.assumptionStatus].join(' ').toLowerCase().includes(q.toLowerCase())&&(!phase||String(p.phaseNumber)===phase)&&(!block||String(p.blockNumber)===block)&&(!lot||String(p.lotNumber)===lot)&&(!status||(status==='ASSUMPTION_PENDING'?p.assumptionStatus==='PENDING':status==='ASSUMED'?p.assumptionStatus==='ASSUMED':p.status===status)));
}
