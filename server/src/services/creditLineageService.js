import PropertyAssignment from '../models/PropertyAssignment.js';
import LotTransfer from '../models/LotTransfer.js';
import CancellationCase from '../models/CancellationCase.js';
import {allocatePayments} from '../utils/paymentLedger.js';
const id=v=>String(v?._id||v),fail=m=>{throw Object.assign(new Error(m),{statusCode:409})};
const run=(q,s)=>s?q.session(s):q;
// Reconcile only previously approved, uniquely allocated credit. Never create
// synthetic payment transactions or turn inherited credits into collections.
export async function inspectCreditLineage(account,session=null){
 const versions=new Map(),proofs=[],visiting=new Set(),memo=new Map();
 async function visit(a){const key=id(a._id);if(visiting.has(key))fail(`Credit lineage cycle at ${a.assignmentId}.`);if(memo.has(key))return memo.get(key);visiting.add(key);let inherited=0;const seen=new Set();
  if(a.transferIn){const t=a.transferIn;if(!t.transferId||!t.sourceId)fail(`${a.assignmentId}: inherited transfer lacks an approved source reference.`);
   const transfer=await run(LotTransfer.findOne({transferId:t.transferId}),session).lean(),parent=await run(PropertyAssignment.findById(t.sourceId),session).lean();
   if(!transfer||!parent||id(parent.client)!==id(account.client)||id(transfer.source)!==id(parent._id)||id(transfer.replacement)!==key||parent.lifecycle!=='TRANSFERRED'||id(parent.transferOut?.replacementId)!==key||parent.transferOut?.transferId!==t.transferId)fail(`${a.assignmentId}: transfer ${t.transferId} has inconsistent ownership or successor links.`);
   const amount=transfer.snapshot?.plan?.creditCents;if(!Number.isSafeInteger(amount)||amount<0||amount!==t.creditCents)fail(`${a.assignmentId}: transfer credit does not match its approved financial snapshot.`);
   await visit(parent);versions.set(id(parent._id),{id:id(parent._id),version:parent.__v,contractId:parent.assignmentId});
   if(amount>allocatePayments(parent,transfer.effectiveDate).principalPaidCents)fail(`${parent.assignmentId}: transferred credit exceeds reconciled principal history.`);
   proofs.push({type:'TRANSFER',reference:t.transferId,from:id(parent._id),to:key,amountCents:amount});inherited+=amount;
  }
  for(const amendment of a.creditAmendments||[]){if(!amendment.caseId||seen.has(amendment.caseId))fail(`${a.assignmentId}: duplicate or missing cancellation credit reference.`);seen.add(amendment.caseId);
   const c=await run(CancellationCase.findOne({caseId:amendment.caseId}),session).lean();if(!c||id(c.client)!==id(account.client)||!['CANCELLED','SETTLED'].includes(c.status))fail(`${a.assignmentId}: cancellation ${amendment.caseId} is not a finalized matching case.`);
   const targets=(c.finalSnapshot?.targets||[]).filter(t=>id(t.accountId)===key);if(targets.length!==1||targets[0].creditCents!==amendment.creditCents)fail(`${a.assignmentId}: inherited credit does not match the finalized target allocation.`);
   const all=c.finalSnapshot.targets.reduce((n,t)=>n+t.creditCents,0);if(all!==c.snapshot.distribution.creditCents)fail(`${c.caseId}: credit distribution totals require reconciliation.`);
   for(const sourceId of c.sourceIds){const parent=await run(PropertyAssignment.findById(sourceId),session).lean();if(!parent||id(parent.client)!==id(account.client)||parent.lifecycle!=='CANCELLED'||parent.cancellationOut?.caseId!==c.caseId)fail(`${c.caseId}: original cancelled contract is not linked correctly.`);await visit(parent);versions.set(id(parent._id),{id:id(parent._id),version:parent.__v,contractId:parent.assignmentId});}
   if(!Number.isSafeInteger(amendment.creditCents)||amendment.creditCents<=0)fail(`${a.assignmentId}: invalid inherited credit amount.`);
   proofs.push({type:'CANCELLATION',reference:c.caseId,to:key,amountCents:amendment.creditCents});inherited+=amendment.creditCents;
  }
  if(!Number.isSafeInteger(inherited))fail('Inherited credits exceed supported precision.');visiting.delete(key);memo.set(key,inherited);return inherited;
 }
 const inheritedCreditCents=await visit(account);return {inheritedCreditCents,proofs,protectedAccounts:[...versions.values()]};
}
export async function fenceCreditLineage(review,session,excludedIds=[]){for(const a of review?.protectedAccounts||[]){if(excludedIds.map(id).includes(a.id))continue;const r=await PropertyAssignment.updateOne({_id:a.id,__v:a.version},{$inc:{__v:1}},{session});if(!r.modifiedCount)fail(`${a.contractId}: credit source changed; review a fresh preview.`)}}
