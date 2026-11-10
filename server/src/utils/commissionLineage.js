import {calculateCommissions,effectivePayout} from './commissionLedger.js';
import {allocatePayments} from './paymentLedger.js';
const fail=(message,conflicts=[])=>{throw Object.assign(new Error(message),{statusCode:409,conflicts})};
const same=(a,b)=>String(a)===String(b);
// Only explicit, approved continuation links are traversed. Transfer/client
// similarity alone is never treated as proof of a shared financial lineage.
export async function reconcileCommissionLineage(heads,load,{verifyMissingLink}={}){
 const accounts=new Map(),visiting=new Set(),conflicts=[],repairs=[];
 async function visit(a){const id=String(a._id);if(visiting.has(id))fail('Commission lineage contains a cycle.',[{contractId:a.assignmentId}]);if(accounts.has(id))return;
  visiting.add(id);const c=a.commissionContinuation;
  const parents=c?.sourceIds||[c?.sourceId].filter(Boolean);
  for(const parentId of parents){if(same(parentId,id))continue;const parent=await load(parentId);if(!same(parent.client,a.client))fail('Commission lineage crosses client ownership.',[{contractId:a.assignmentId,parentId}]);
   if(!same(parent.commissionContinuationOut?.targetId,id)){if(!parent.commissionContinuationOut&&verifyMissingLink&&await verifyMissingLink(parent,a))repairs.push({sourceId:String(parent._id),targetId:id,sourceContract:parent.assignmentId,targetContract:a.assignmentId,records:calculateCommissions(parent,allocatePayments(parent)).records});else conflicts.push({contractId:parent.assignmentId,successor:a.assignmentId,issue:'Missing or conflicting reciprocal approved successor link'});}
   await visit(parent);
  }
  visiting.delete(id);accounts.set(id,a);
 }
 for(const head of heads)await visit(head);
 const records=[],seenRecords=new Map(),seenPayouts=new Map(),seenCashReferences=new Map(),agents=new Map();
 for(const [accountId,a]of accounts){
  const snapshot=calculateCommissions(a,allocatePayments(a));
  for(const row of snapshot.records){const key=row.commissionId;if(seenRecords.has(key)){conflicts.push({commissionId:key,contracts:[seenRecords.get(key),a.assignmentId],issue:'Duplicate commission identity across contracts'});continue}for(const allocation of row.sourceAllocations||[]){const owner=seenCashReferences.get(allocation.paymentId);if(owner&&owner!==accountId)conflicts.push({commissionId:key,contractId:a.assignmentId,paymentId:allocation.paymentId,issue:'Payment earning source is duplicated across contracts'});seenCashReferences.set(allocation.paymentId,accountId);}
   seenRecords.set(key,a.assignmentId);records.push({...row,ownerAccountId:accountId,ownerContractId:a.assignmentId});
   const agent=String(row.agent),total=agents.get(agent)||{agent,agentId:row.agentId,earnedCents:0,releasedCents:0,recoveredCents:0,recoveryDueCents:0,historicalVerificationCents:0,heldCents:0};for(const k of ['earnedCents','releasedCents','recoveredCents','recoveryDueCents','historicalVerificationCents','heldCents'])total[k]+=row[k]||0;agents.set(agent,total);
  }
  for(const raw of a.commissionPayouts||[]){const p=effectivePayout(raw);if(!p.payoutId){conflicts.push({contractId:a.assignmentId,commissionId:p.commissionId,issue:'Payout lacks a permanent identity'});continue}if(seenPayouts.has(p.payoutId))conflicts.push({payoutId:p.payoutId,contracts:[seenPayouts.get(p.payoutId),a.assignmentId],issue:'Duplicate payout identity'});seenPayouts.set(p.payoutId,a.assignmentId);if(!snapshot.records.some(r=>r.commissionId===p.commissionId))conflicts.push({contractId:a.assignmentId,payoutId:p.payoutId,issue:'Payout has no matching commission record'});}
 }
 for(const a of agents.values()){for(const k of ['earnedCents','releasedCents','recoveredCents','recoveryDueCents','historicalVerificationCents','heldCents'])if(!Number.isSafeInteger(a[k])||a[k]<0)fail('Commission lineage totals exceed supported precision.');a.unreleasedCents=Math.max(0,a.earnedCents-a.releasedCents+a.recoveredCents)}
 if(conflicts.length)fail('Commission lineage reconciliation requires administrator review: '+conflicts.map(c=>`${c.contractId||c.commissionId||c.payoutId}: ${c.issue}`).join('; '),conflicts);
 const inheritedRoots=[...accounts.values()].flatMap(a=>a.commissionContinuation?.originalAgreementIds||[]);
 const rootIds=[...accounts.values()].filter(a=>!a.commissionContinuation||!(a.commissionContinuation.sourceIds||[a.commissionContinuation.sourceId]).some(p=>!same(p,a._id))).map(a=>a.commissionAgreement?.originalAgreementId||a.commissionAgreement?.agreementId||`CA-${a.assignmentId}`);
 return {repairs,accounts:[...accounts.values()],records,agents:[...agents.values()],rootAgreementIds:[...new Set([...inheritedRoots,...rootIds])],sequence:Math.max(0,...[...accounts.values()].map(a=>a.commissionContinuation?.amendmentSequence||a.commissionContinuation?.lineage?.sequence||0))+1};
}
export function commissionLineageTimeline(accounts){
 const entries=new Map();
 for(const a of accounts){const contractId=a.assignmentId,agreement=a.commissionAgreement;
  if(agreement&&!a.commissionContinuation)entries.set('original:'+String(a._id),{id:'original:'+String(a._id),type:'ORIGINAL_AGREEMENT',contractId,agreementId:agreement.agreementId||`CA-${contractId}`,date:agreement.timestamp||agreement.assignmentCreatedAt||null,description:'Original approved commission agreement'});
  for(const h of a.commissionAgreementHistory||[]){if(h.action!=='COMMISSION_RECONFIGURED')continue;const key='amendment:'+(h.updatedValues?.agreementId||h.updatedValues?.continuationId||`${contractId}:${h.timestamp}`);entries.set(key,{id:key,type:h.preview?.option||'AMENDMENT',contractId,agreementId:h.updatedValues?.agreementId,date:h.timestamp,description:h.reason,previous:h.previousValues,proposed:h.updatedValues,comparison:h.preview?.plan});}
  for(const e of a.auditEvents||[]){if(!/LOT_TRANSFER|CANCELLATION|FORFEITURE|PAYMENT_AGREEMENT/.test(e.action||''))continue;const key=`contract:${e.action}:${e.transferId||e.caseId||contractId}:${e.timestamp||''}`;entries.set(key,{id:key,type:e.action,contractId,date:e.timestamp||null,description:e.reason||e.action});}
  for(const r of a.commissionSnapshot?.records||[]){if(!r.earnedCents)continue;const key='earned:'+r.commissionId;entries.set(key,{id:key,type:'EARNED',contractId,date:r.earningDate,agentId:r.agentId,amountCents:r.earnedCents,description:r.commissionId});}
  for(const raw of a.commissionPayouts||[]){const p=effectivePayout(raw),key='payout:'+p.payoutId;entries.set(key,{id:key,type:p.status==='VOIDED'?'VOIDED_PAYOUT':'PAYOUT',contractId,date:p.releaseDate,agentId:p.agentId,amountCents:p.amountCents,description:p.payoutId});}
  for(const h of a.commissionHoldHistory||[]){const key=`hold:${contractId}:${h.timestamp}:${h.action}`;entries.set(key,{id:key,type:'HOLD',contractId,date:h.timestamp,description:h.reason||h.action});}
 }
 return [...entries.values()].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||a.id.localeCompare(b.id));
}
