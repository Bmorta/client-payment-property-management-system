import PropertyAssignment from '../models/PropertyAssignment.js';
import Agent from '../models/Agent.js';
import {apportionBudgets} from '../utils/commissionLedger.js';
import {effectivePayment} from '../utils/paymentLedger.js';
import {isPosted} from '../utils/financialReporting.js';
import {commissionWorkflowReview} from '../utils/commissionWorkflowWarnings.js';
import {allocatePayments} from '../utils/paymentLedger.js';
export async function unallocatedCommissions(req,res,next){try{
 const q=String(req.query.q||'').trim().toLowerCase(),page=Math.max(1,Math.min(100000,parseInt(req.query.page)||1));
 const [accounts,agents]=await Promise.all([PropertyAssignment.find().populate('client','clientId firstName lastName').populate('project','projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').lean(),Agent.find().select('fullName agentId').lean()]);const names=new Map(agents.map(a=>[String(a._id),a.fullName]));
 const rows=accounts.map(a=>{const agreement=a.commissionAgreement,budget=agreement?.propertyBudgetCents??null,allocated=agreement?[...apportionBudgets(a.contract.totalCents,agreement.agents||[]).values()].reduce((n,v)=>n+v,0):null;
 const snapshot=agreement?commissionWorkflowReview(a,allocatePayments(a)):null,held=snapshot?.records.some(r=>r.releaseHold),verification=snapshot?.records.some(r=>r.historicalVerificationRequired||r.recoveryDueCents>0),payments=(a.payments||[]).filter(isPosted).map(effectivePayment).filter(p=>p.amountCents>0).sort((a,b)=>a.paymentDate.localeCompare(b.paymentDate));
 return {accountId:String(a._id),assignmentId:a.assignmentId,client:a.client,project:a.project,property:a.property,budgetCents:budget,allocatedCents:allocated,unallocatedCents:budget===null?null:Math.max(0,budget-allocated),status:!agreement?'NOT_ASSIGNED':budget===null?'RECONCILIATION':allocated<budget?'PARTIALLY_ALLOCATED':'FULLY_ALLOCATED',earnedCents:snapshot?snapshot.records.reduce((n,r)=>n+r.earnedCents,0):null,hold:!!held,requiresReconciliation:!!verification||!!agreement&&budget===null,agents:(agreement?.agents||[]).map(r=>names.get(String(r.agent))||r.agentId),payments:payments.map(p=>({paymentDate:p.paymentDate,paymentId:p.paymentId,receiptNumber:p.receiptNumber,amountCents:p.amountCents}))};
 }).filter(r=>!q||[r.assignmentId,r.client?.clientId,r.client?.firstName,r.client?.lastName,r.project?.projectName,r.property?.propertyId,...r.agents].join(' ').toLowerCase().includes(q)).filter(r=>!req.query.status||req.query.status==='ON_HOLD'&&r.hold||req.query.status==='RECONCILIATION'&&r.requiresReconciliation||r.status===req.query.status);
 res.json({success:true,data:{rows:rows.slice((page-1)*20,page*20),total:rows.length,page,pageSize:20}});
}catch(e){next(e)}}
