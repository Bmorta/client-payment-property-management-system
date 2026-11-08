import PropertyAssignment from '../models/PropertyAssignment.js';
import {currentPenaltyPolicy} from '../../../shared/penaltyPolicy.js';
import {allocatePayments} from '../utils/paymentLedger.js';
import {today} from '../utils/accounting.js';
import {intentHash,intentFail as fail} from '../utils/paymentIntent.js';
import {attachMonitoringUpdate} from '../services/monitoringService.js';
export async function paymentPenaltyPolicy(req,res,next){try{
 const account=await PropertyAssignment.findById(req.params.id).lean();if(!account)fail('Account not found.',404);
 if(!account.contract.monitoringTerms)fail('Configure the installment rate, grace period and monitoring terms first.');
 const basis=req.body.penaltyBasis;if(!['FULL_INSTALLMENT','UNPAID_BALANCE'].includes(basis))fail('Choose full scheduled installment or unpaid installment balance.');
 const previous=currentPenaltyPolicy(account),initial=previous?.pendingPaymentPolicy===true&&!(account.paymentPenaltyPolicies||[]).length;
 const status=req.body.penaltyStatus||'ACTIVE';if(!['ACTIVE','DISABLED','WAIVED'].includes(status))fail('Choose a valid penalty status.');
 if(!initial&&String(req.body.reason||'').trim().length<5)fail('Enter a reason for changing the saved payment penalty policy.');
 const policy={penaltyBasis:basis,penaltyStatus:status,pendingPaymentPolicy:false,effectiveDate:initial?account.contract.contractDate:today(),allocationPriority:previous?.allocationPriority||'PRINCIPAL_FIRST'};
 const proposed={...account,paymentPenaltyPolicies:[...(account.paymentPenaltyPolicies||[]),policy]},before=allocatePayments(account),after=allocatePayments(proposed),data={initial,policy,overduePrincipalCents:after.schedule.filter(s=>s.overdue).reduce((n,s)=>n+s.balanceCents,0),previousPenaltyCents:before.outstandingPenaltyCents,penaltyCents:after.outstandingPenaltyCents};
 const token=intentHash({version:account.__v,data,asOf:today()});if(req.path.endsWith('/preview'))return res.json({success:true,data:{...data,token}});
 if(req.body.confirm!==true||req.body.previewToken!==token||req.body.expectedVersion!==account.__v)fail('Review and confirm a fresh penalty calculation preview.',409);
 const actor={userId:String(req.user._id),username:req.user.username,role:req.user.role,timestamp:new Date()},savedPolicy={...policy,...actor},reason=String(req.body.reason||'Initial penalty basis selected in Payments').trim().slice(0,500);
 const update=attachMonitoringUpdate({...proposed,paymentPenaltyPolicies:[...(account.paymentPenaltyPolicies||[]),savedPolicy]},{$push:{paymentPenaltyPolicies:savedPolicy,auditEvents:{action:'PAYMENT_PENALTY_POLICY_SAVED',previousValues:previous,updatedValues:policy,reason,...actor}},$inc:{__v:1}},actor,reason);
 const result=await PropertyAssignment.updateOne({_id:account._id,__v:account.__v},update,{runValidators:true});if(result.modifiedCount!==1)fail('Account changed. Review the calculation again.',409);
 res.json({success:true,data,message:'Payment penalty basis saved. Assessments and account totals recalculated.'});
 }catch(e){next(e)}}
