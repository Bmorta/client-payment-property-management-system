import SalesPlanningRecord from '../models/SalesPlanningRecord.js';
import {recordId} from './salesClassification.js';
export async function loadSalesAttributions(accounts){
 const keys=accounts.map(a=>'attribution:'+recordId(a));
 // Chunk IDs to avoid oversized database queries at large offices.
 const records=[];for(let i=0;i<keys.length;i+=1000)records.push(...await SalesPlanningRecord.find({_id:{$in:keys.slice(i,i+1000)},kind:'ATTRIBUTION'}).select('value version').lean());
 const byAccount=new Map(records.map(r=>[r.value.accountId,r]));
 return accounts.map(a=>{const r=byAccount.get(recordId(a));return r?{...a,salesAttribution:{...r.value,version:r.version}}:a});
}
