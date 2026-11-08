import PaymentBatch from '../models/PaymentBatch.js';
import CommissionVoucher from '../models/CommissionVoucher.js';
import CashLedgerEntry from "../models/CashLedgerEntry.js";
import Project from '../models/Project.js';
import Expense from '../models/Expense.js';
import Phase from '../models/Phase.js';
import Block from '../models/Block.js';
import Property from '../models/Property.js';
import Agent from '../models/Agent.js';
import Client from '../models/Client.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import SequenceCounter from '../models/SequenceCounter.js';
const definitions={paymentBatch:[PaymentBatch,"batchReference","PB"],commissionVoucher:[CommissionVoucher,"voucherNumber","CV"],cashEntry:[CashLedgerEntry,"entryId","CSH"],project:[Project,'projectId','PRJ'],expense:[Expense,'expenseId','EXP'],phase:[Phase,'phaseId','PHS'],block:[Block,'blockId','BLK'],property:[Property,'propertyId','PROP'],contract:[PropertyAssignment,'assignmentId','CTR'],agent:[Agent,'agentId','AGT'],client:[Client,'clientId','CL'],payment:[PropertyAssignment,'payments.paymentId','PAY','payments'],commissionPayout:[PropertyAssignment,'commissionPayouts.payoutId','CPY','commissionPayouts'],request:[PropertyAssignment,'correctionRequests.requestNumber','REQ','correctionRequests']};
// Reconcile legacy numeric sequences before atomic increments. Gaps are allowed;
// archived/deleted IDs are never returned to the counter. Receipts are external.
export async function generateRecordId(type){
 const definition=definitions[type];if(!definition)throw new Error(`Unknown record ID type: ${type}`);
 const [model,field,prefix,array]=definition,pattern=type==='client'?'^(CL|CLT)-[0-9]+$':`^${prefix}-[0-9]+$`;
 const rows=await model.aggregate([
  ...(array?[{$unwind:`$${array}`}]:[]),{$match:{[field]:{$regex:pattern}}},
  {$group:{_id:null,value:{$max:{$convert:{input:{$arrayElemAt:[{$split:[`$${field}`,'-']},-1]},to:'double',onError:0,onNull:0}}}}}
 ]);
 const value=rows[0]?.value||0;if(!Number.isSafeInteger(value)||value>=Number.MAX_SAFE_INTEGER)throw new Error('Identifier sequence is outside the supported range.');
 try{await SequenceCounter.findOneAndUpdate({_id:type},{$max:{value}},{upsert:true})}catch(e){if(e.code!==11000)throw e;await SequenceCounter.findOneAndUpdate({_id:type},{$max:{value}})}
 let counter;try{counter=await SequenceCounter.findOneAndUpdate({_id:type},{$inc:{value:1}},{new:true,upsert:true})}catch(e){if(e.code!==11000)throw e;counter=await SequenceCounter.findOneAndUpdate({_id:type},{$inc:{value:1}},{new:true})}
 if(!Number.isSafeInteger(counter.value)||counter.value<1)throw new Error('Identifier sequence is outside the supported range.');
 return `${prefix}-${String(counter.value).padStart(6,'0')}`;
}
