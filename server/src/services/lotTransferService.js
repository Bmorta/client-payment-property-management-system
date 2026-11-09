import mongoose from 'mongoose';
import {createHash} from 'node:crypto';
import PropertyAssignment from '../models/PropertyAssignment.js';
import Property from '../models/Property.js';
import Project from '../models/Project.js';
import Client from '../models/Client.js';
import MigrationBatch from '../models/MigrationBatch.js';
import CommissionVoucher from '../models/CommissionVoucher.js';
import LotTransfer from '../models/LotTransfer.js';
import {allocatePayments,effectivePayment} from '../utils/paymentLedger.js';
import {calculateCommissions} from '../utils/commissionLedger.js';
import {moneyCents,validDate,today} from '../utils/accounting.js';
import {monthDate,validTerm} from '../../../shared/paymentSchedule.js';
import {lotPrice} from '../utils/lotPricing.js';
import {generateRecordId} from '../utils/generateRecordId.js';
import {validateTerms} from '../../../shared/contractTerms.js';
import {fail} from '../utils/financialReporting.js';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const scoped=(query,session)=>query.session(session||null);
const cents=v=>moneyCents(v??0);
function split(amount,n){const floor=Math.floor(amount/n),extra=amount%n;return Array.from({length:n},(_,i)=>floor+(i<extra?1:0))}
export function transferPlan(source,target,input,date=today()){
 if(!validDate(input.effectiveDate)||input.effectiveDate>date||input.effectiveDate<source.contract.contractDate)fail('Choose a transfer date between the contract date and today.');
 if((source.payments||[]).some(p=>effectivePayment(p).paymentDate>input.effectiveDate)||(source.commissionPayouts||[]).some(p=>(p.revisions?.at(-1)?.values?.releaseDate||p.releaseDate)>input.effectiveDate))fail('Transfer date cannot precede recorded payments or payouts.');
 const ledger=allocatePayments(source,input.effectiveDate),eligibleCreditCents=ledger.principalPaidCents,creditCents=cents(input.credit),adjustmentReason=String(input.adjustmentReason||'').trim(),nonTransferredDisposition=String(input.nonTransferredDisposition||'').trim();
 if(adjustmentReason.length>500||nonTransferredDisposition.length>500)fail('Keep credit justification and disposition within 500 characters.');
 if(creditCents>eligibleCreditCents)fail('Approved credit cannot exceed actual allocated principal.');
 if(creditCents!==eligibleCreditCents&&(adjustmentReason.length<5||nonTransferredDisposition.length<5))fail('Explain the adjusted credit and disposition of all non-transferred principal (at least 5 characters each).');
 const price=lotPrice(target.areaSqm,target.pricePerSqm);if(!price||price<=0)fail('Set the target lot area and selling price first.');
 const priceCents=cents(price),interestCents=cents(input.interest),feesCents=cents(input.fees),chargesReason=String(input.chargesReason||'').trim();if(chargesReason.length>1000)fail('Keep the charge calculation basis within 1000 characters.');if((interestCents||feesCents)&&chargesReason.length<5)fail('Document the agreed interest/fee amounts and calculation basis.');
 const totalCents=priceCents+interestCents+feesCents,downPaymentCents=cents(input.downPayment);if(downPaymentCents>totalCents||creditCents>totalCents)fail('Down payment or approved credit exceeds the new contract price. Resolve excess credit explicitly.');
 const remainingMonths=ledger.schedule.filter(s=>s.installment>0&&s.balanceCents>0).length,months=input.termMode==='CONTINUE'?remainingMonths:Number(input.months);
 if(!['CONTINUE','NEW'].includes(input.termMode)||!validTerm(months))fail('Choose a valid new term; a fully covered old schedule requires a new term.');
 const startDate=input.startDate,firstDueDate=input.firstDueDate,dueDay=Number(input.dueDay);
 if(!validDate(startDate)||!validDate(firstDueDate)||startDate<input.effectiveDate||firstDueDate<startDate||!Number.isInteger(dueDay)||dueDay<1||dueDay>31)fail('Choose installment start/first due dates on or after transfer and a due day from 1–31.');
 const y=Number(firstDueDate.slice(0,4)),m=Number(firstDueDate.slice(5,7)),last=new Date(Date.UTC(y,m,0)).getUTCDate(),clamped=firstDueDate.slice(0,7)+'-'+String(Math.min(dueDay,last)).padStart(2,'0');
 if(firstDueDate!==clamped)fail('The first due date must match the chosen due day (clamped at month-end).');
 const dpCredit=Math.min(creditCents,downPaymentCents),monthlyCredit=creditCents-dpCredit,financedCents=totalCents-downPaymentCents-monthlyCredit;
 const net=split(financedCents,months),credits=split(monthlyCredit,months),schedule=[{installment:0,dueDate:input.effectiveDate,amountCents:downPaymentCents-dpCredit},...net.map((v,i)=>({installment:i+1,dueDate:monthDate(firstDueDate,i),amountCents:v}))];
 // Preserve an anchor of day 29–31 even after a February first due date was clamped.
 for(const row of schedule.filter(s=>s.installment>0)){const d=new Date(Date.UTC(y,m-1+row.installment-1,1)),lastDay=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();row.dueDate=d.toISOString().slice(0,7)+'-'+String(Math.min(dueDay,lastDay)).padStart(2,'0');}
 const allocations=[...(dpCredit?[{installmentId:'I0',amountCents:dpCredit}]:[]),...credits.map((amountCents,i)=>({installmentId:'I'+(i+1),amountCents})).filter(a=>a.amountCents>0)];
 if(!source.contract.monitoringTerms&&!input.monitoringTerms)fail('Configure replacement payment monitoring terms explicitly.');
 const monitoringTerms=validateTerms({...source.contract.monitoringTerms,...(input.monitoringTerms||{}),dueDay,effectiveDate:input.effectiveDate},input.effectiveDate);
 if(ledger.outstandingPenaltyCents>0&&input.penaltyResolution!=='WAIVE')fail('Settle outstanding penalties before transfer or explicitly approve their waiver. Penalties cannot become principal credit.');
 if(input.commissionResolution!=='RETAIN_EARNED_ON_ORIGINAL'||input.commissionConfirmed!==true)fail('Review and confirm retained earned commissions and actual payouts on the original contract.');
 const commissions=calculateCommissions(source,ledger,{asOf:input.effectiveDate});if(commissions.records.some(r=>r.recoveryDueCents>0||r.historicalVerificationCents>0))fail('Reconcile commission recovery balances and historical payout verification before transfer.',409);
 const reason=String(input.reason||'').trim();if(reason.length<5||reason.length>500)fail('Provide the transfer approval reason (5–500 characters).');
 return {effectiveDate:input.effectiveDate,eligibleCreditCents,creditCents,oldTotalCents:source.contract.totalCents,oldDownPaymentCents:source.contract.downPaymentCents,nonTransferredCents:eligibleCreditCents-creditCents,adjustmentReason,nonTransferredDisposition,priceCents,interestCents,feesCents,chargesReason,totalCents,downPaymentCents,dpCreditCents:dpCredit,remainingDownPaymentCents:downPaymentCents-dpCredit,financedCents,remainingBalanceCents:totalCents-creditCents,remainingMonths,months,termMode:input.termMode,startDate,firstDueDate,dueDay,monthlyCents:net[0],finalMonthlyCents:net.at(-1),schedule,creditAllocations:allocations,monitoringTerms,oldSchedule:ledger.schedule,oldBalanceCents:ledger.balanceCents,oldPenaltyCents:ledger.outstandingPenaltyCents,penaltyResolution:ledger.outstandingPenaltyCents?'WAIVE':'NONE',penaltyAssessments:ledger.assessments.filter(a=>a.balanceCents>0),commissionResolution:input.commissionResolution,commissions,reason,clearOldLot:input.clearOldLot===true,clearanceReason:String(input.clearanceReason||'').trim(),sourcePayments:(source.payments||[]).map(p=>({paymentId:p.paymentId,receiptNumber:p.receiptNumber,paymentDate:p.paymentDate,amountCents:p.amountCents,revisions:p.revisions||[]}))};
}
export async function prepareTransfer(id,input,session=null){
 if(!mongoose.isValidObjectId(id)||!mongoose.isValidObjectId(input.targetPropertyId))fail('Select a valid source and destination lot.');
 const source=await scoped(PropertyAssignment.findById(id),session).lean();if(!source)fail('Source contract not found.',404);if(['TRANSFERRED','CANCELLED'].includes(source.lifecycle)||source.pendingCancellation||source.creditAmendments?.length||source.transferOut)fail('This contract already has a completed transfer.',409);
 if(source.migration&&!source.migration.activatedAt||['CANCELLED','FORFEITED','TRANSFERRED'].includes(source.migration?.historicalStatus))fail('This historical account requires reconciliation before transfer.',409);
 if(['FORFEITED','APPROVED_FOR_FORFEITURE'].includes(source.forfeitureReviews?.at(-1)?.status))fail('Resolve the forfeiture review before transfer.',409);
 if(source.correctionRequests?.some(r=>['PENDING','PENDING_APPROVAL'].includes(r.status)))fail('Resolve pending payment corrections first.',409);
 if(await scoped(MigrationBatch.exists({account:source._id,status:{$nin:['COMPLETED','CANCELLED']}}),session))fail('Finish or cancel the staged migration before transfer.',409);
 const target=await scoped(Property.findById(input.targetPropertyId),session).lean(),oldProperty=await scoped(Property.findById(source.property),session).lean();
 if(!target||String(target._id)===String(source.property)||target.status!=='AVAILABLE'||target.client)fail('Select another available, unassigned lot.',409);
 if(!oldProperty||String(oldProperty.client)!==String(source.client))fail('Original inventory/client link requires administrator reconciliation.',409);
 const [project,client]=await Promise.all([scoped(Project.findById(target.project),session).lean(),scoped(Client.findById(source.client),session).lean()]);if(!project||project.status==='ARCHIVED'||!client||client.status!=='ACTIVE')fail('Choose an active client and a destination project that is not archived.',409);
 if(await scoped(PropertyAssignment.exists({property:target._id,lifecycle:{$nin:['TRANSFERRED','CANCELLED']}}),session))fail('Destination lot already has an active account.',409);
 const vouchers=await scoped(CommissionVoucher.find({'entries.accountId':String(source._id),approvalState:{$ne:'CANCELLED'}}),session).lean();for(const voucher of vouchers){if(voucher.paymentIntent)fail('Resolve pending commission payouts before transfer.',409);for(const entry of voucher.entries.filter(e=>e.accountId===String(source._id))){const paid=(source.commissionPayouts||[]).filter(p=>String(p.voucherId)===String(voucher._id)&&p.voucherEntryId===entry.entryId).reduce((n,p)=>n+(p.revisions?.at(-1)?.values?.voided?0:p.revisions?.at(-1)?.values?.amountCents??p.amountCents),0);if(paid<entry.amountCents)fail('Resolve open commission vouchers before transfer.',409);}}
 const plan=transferPlan(source,target,input);if(plan.clearanceReason.length>500)fail('Keep clearance justification within 500 characters.');if(plan.clearOldLot&&plan.clearanceReason.length<5)fail('Document clearance before releasing the original lot.');
 const oldProject=await scoped(Project.findById(source.project),session).lean();
 const snapshot={inheritedTransfer:source.transferIn||null,sourceId:String(source._id),sourceVersion:source.__v??0,sourceContractId:source.assignmentId,client:{id:String(client._id),clientId:client.clientId,name:[client.firstName,client.lastName].join(' ')},oldProperty:{...oldProperty,projectName:oldProject?.projectName},target:{...target,projectName:project.projectName},plan};
 return {source,target,oldProperty,plan,snapshot,previewToken:hash({snapshot,input,asOf:today()})};
}
export async function finalizeTransfer(id,input,actor){
 const duplicate=await LotTransfer.findOne({requestId:input.requestId}).lean();if(duplicate){if(String(duplicate.source)!==id||duplicate.approval.inputHash!==hash(input.payload))fail('Submission ID belongs to a different transfer.',409);return duplicate}
 if(input.confirm!==true||typeof input.requestId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(input.requestId))fail('Review the preview and explicitly confirm administrator approval.');
 const hello=await mongoose.connection.db.admin().command({hello:1});if(!hello.setName&&hello.msg!=='isdbgrid')fail('Lot transfers require MongoDB replica-set transaction support. No transfer was posted.',409);
 const indexes=await PropertyAssignment.collection.indexes();if(indexes.some(i=>i.unique&&Object.keys(i.key).length===1&&i.key.property===1&&!i.partialFilterExpression)||!indexes.some(i=>i.name==='active_property_contract'&&i.unique&&i.partialFilterExpression?.lifecycle==='ACTIVE'))fail('Administrator must complete the reviewed active-contract index upgrade before transfers. No transfer was posted.',409);
 await LotTransfer.init();const transferId=await generateRecordId('lotTransfer'),assignmentId=await generateRecordId('contract'),replacementId=new mongoose.Types.ObjectId(),session=await mongoose.startSession();let result;
 try{await session.withTransaction(async()=>{
 const previous=await LotTransfer.findOne({requestId:input.requestId}).session(session).lean();if(previous){if(String(previous.source)!==id||previous.approval.inputHash!==hash(input.payload))fail('Submission ID belongs to another transfer.',409);result=previous;return}
 const prepared=await prepareTransfer(id,input.payload,session);if(prepared.previewToken!==input.previewToken)fail('Transfer details changed. Review a fresh preview.',409);const {source,target,oldProperty,plan,snapshot}=prepared,stamp=new Date(),event={action:'LOT_TRANSFER_APPROVED',transferId,reason:plan.reason,...actor,timestamp:stamp};
 const sourceUpdate=await PropertyAssignment.updateOne({_id:source._id,__v:source.__v,lifecycle:{$nin:['TRANSFERRED','CANCELLED']}},{$set:{lifecycle:'TRANSFERRED',transferOut:{transferId,replacementId,effectiveDate:plan.effectiveDate,creditCents:plan.creditCents,nonTransferredCents:plan.nonTransferredCents,penaltyResolution:plan.penaltyResolution,commissionResolution:plan.commissionResolution},notifications:[...(source.notifications||[]).map(n=>n.monitoringAlert&&n.active?{...n,active:false,resolvedAt:stamp}:n),...['ADMIN','STAFF'].map(recipient=>({id:transferId+':'+recipient,recipient,status:'LOT_TRANSFER_APPROVED',message:transferId+': contract transferred; use '+assignmentId,href:'/clients/'+source.client+'/accounts?tab=properties&account='+replacementId,createdAt:stamp,readBy:[]}))]},$push:{auditEvents:event,...(plan.penaltyAssessments.length?{penaltyWaivers:{$each:plan.penaltyAssessments.map(a=>({assessmentId:a.assessmentId,amountCents:a.balanceCents,effectiveDate:plan.effectiveDate,reason:'Transfer waiver: '+plan.reason,transferId,...actor,timestamp:stamp}))}}:{})},$inc:{__v:1}},{session});if(!sourceUpdate.modifiedCount)fail('Source contract changed. Refresh preview.',409);
 const targetClaim=await Property.updateOne({_id:target._id,status:'AVAILABLE',client:null,areaSqm:target.areaSqm,pricePerSqm:target.pricePerSqm},{$set:{client:source.client,status:'RESERVED'},$inc:{__v:1}},{session});if(!targetClaim.modifiedCount)fail('Destination lot is no longer available.',409);
 const oldClaim=await Property.updateOne({_id:oldProperty._id,client:source.client,__v:oldProperty.__v},{$set:{status:plan.clearOldLot?'AVAILABLE':'UNAVAILABLE',client:plan.clearOldLot?null:source.client},$inc:{__v:1}},{session});if(!oldClaim.modifiedCount)fail('Original inventory changed. Refresh preview.',409);
 const clientFence=await Client.updateOne({_id:source.client,status:'ACTIVE'},{$inc:{__v:1}},{session}),projectFence=await Project.updateOne({_id:target.project,status:{$ne:'ARCHIVED'}},{$inc:{__v:1}},{session});if(!clientFence.modifiedCount||!projectFence.modifiedCount)fail('Client or destination project eligibility changed.',409);
 await PropertyAssignment.create([{_id:replacementId,assignmentId,client:source.client,project:target.project,property:target._id,lifecycle:'ACTIVE',penaltyCalculationRule:'CURRENT_OVERDUE',transferIn:{transferId,sourceId:source._id,effectiveDate:plan.effectiveDate,creditCents:plan.creditCents,dpCreditCents:plan.dpCreditCents,allocations:plan.creditAllocations},contract:{totalCents:plan.totalCents,downPaymentCents:plan.downPaymentCents,months:plan.months,termType:[12,24,36,48,60].includes(plan.months)?'PREDEFINED':'CUSTOM',contractDate:plan.effectiveDate,firstDueDate:plan.firstDueDate,monthlyInstallmentCents:plan.monthlyCents,areaSqm:target.areaSqm,pricePerSqm:target.pricePerSqm,schedule:plan.schedule,monitoringTerms:plan.monitoringTerms,transferPricing:{priceCents:plan.priceCents,interestCents:plan.interestCents,feesCents:plan.feesCents,creditCents:plan.creditCents,financedCents:plan.financedCents,startDate:plan.startDate}},payments:[],createdBy:actor.userId,auditEvents:[event]}],{session});
 const [row]=await LotTransfer.create([{transferId,requestId:input.requestId,source:source._id,replacement:replacementId,effectiveDate:plan.effectiveDate,approvedBy:actor.userId,username:actor.username,approval:{inputHash:hash(input.payload),...actor},snapshot,history:[event]}],{session});result=row.toObject();
 });return result}finally{await session.endSession()}
}
