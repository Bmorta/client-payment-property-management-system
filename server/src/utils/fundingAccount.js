import {PAYMENT_METHODS} from '../../../shared/paymentMethods.js';
export function physicalFunding(method,value){
 if(method==='OTHER')return ['CASH','NONCASH'].includes(value)?value:null;
 if(!PAYMENT_METHODS.includes(method))return null;
 const expected=method==='CASH'?'CASH':'NONCASH';return value&&value!==expected?null:expected;
}
export function validateFunding(method,value,allowUnknown=false){const funding=physicalFunding(method,value);if(!funding&&!allowUnknown)throw Object.assign(new Error('Identify a funding account consistent with the payment method. For Other, explicitly choose physical Cash or Noncash.'),{statusCode:400});return funding}
export const isCashFunded=row=>physicalFunding(row.method,row.fundingAccount)==='CASH';
