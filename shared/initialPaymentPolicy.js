import {validateTerms} from "./contractTerms.js";
import {currentPenaltyPolicy} from './penaltyPolicy.js';
export function initialPaymentPolicy(account,input,role){
 if(input==null)return null;
 const fail=message=>{throw Object.assign(new Error(message),{statusCode:400})};
 if(role!=='ADMIN')throw Object.assign(new Error('An administrator must approve initial penalty terms.'),{statusCode:403});
 const previous=currentPenaltyPolicy(account);
 if(previous&&!previous.pendingPaymentPolicy||(account.paymentPenaltyPolicies||[]).length)fail('This account already has a saved policy. Refresh before reviewing payment.');
 if(!['FULL_INSTALLMENT','UNPAID_BALANCE'].includes(input.penaltyBasis)||!['ACTIVE','DISABLED','WAIVED'].includes(input.penaltyStatus))fail('Choose the initial penalty basis and status.');
 const monitoringTerms=!account.contract.monitoringTerms?validateTerms({...input.monitoringTerms,pendingPaymentPolicy:false,penaltyBasis:input.penaltyBasis,penaltyStatus:input.penaltyStatus,allocationPriority:'PRINCIPAL_FIRST',frequency:'MONTHLY',effectiveDate:account.contract.contractDate},account.contract.contractDate):null;
 return {...(monitoringTerms?{monitoringTerms}:{}),penaltyBasis:input.penaltyBasis,penaltyStatus:input.penaltyStatus,pendingPaymentPolicy:false,effectiveDate:account.contract.contractDate,allocationPriority:'PRINCIPAL_FIRST'};
}

export function applyInitialPaymentPolicy(account,policy){return policy?{...account,contract:{...account.contract,...(policy.monitoringTerms?{monitoringTerms:policy.monitoringTerms}:{})},paymentPenaltyPolicies:[...(account.paymentPenaltyPolicies||[]),policy]}:account}
