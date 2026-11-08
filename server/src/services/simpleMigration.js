import {effectivePayment} from "../utils/paymentLedger.js";
import {calculateLedger} from "../utils/contractMonitoring.js";
import {materialize,validateBatch} from './migrationService.js';
import {fail} from '../utils/migrationRules.js';
import {validDate,today} from '../utils/accounting.js';
export async function simpleMigrationReview(batch,account,config,session){
 const dates=batch.rows.filter(r=>!r.excluded&&r.date).map(r=>r.date).sort(),cutoffDate=config?.cutoffDate||batch.cutoffDate||dates.at(-1);if(!validDate(cutoffDate)||cutoffDate>today())fail('Enter valid original payment dates before reviewing.');
 const candidate={...batch,cutoffDate,preparationMode:false,simpleApproval:true,reconciliation:{...batch.reconciliation,historicalStatus:batch.reconciliation?.historicalStatus||'ACTIVE'}};
 const calculated=materialize(account,candidate),atCutoff=calculateLedger(calculated.proposed,calculated.proposed.payments.map(effectivePayment),cutoffDate);
 candidate.reconciliation={...candidate.reconciliation,officeBalanceCents:batch.reconciliation?.officeBalanceCents??atCutoff.balanceCents,officePenaltyCents:batch.reconciliation?.officePenaltyCents??atCutoff.outstandingPenaltyCents,documentReference:batch.reconciliation?.documentReference||`Administrator reviewed batch ${batch.batchId}`,expectedPeriods:batch.reconciliation?.expectedPeriods||account.contract.schedule.filter(s=>s.dueDate<=cutoffDate).length||1,commissionReview:batch.rows.some(r=>r.kind==='COMMISSION'&&!r.excluded)?'RECONCILED':account.commissionAgreement?'PENDING':'NOT_APPLICABLE'};
 const {preview,result}=await validateBatch(candidate,account,session);if(account.contract.monitoringTerms?.pendingPaymentPolicy)preview.warnings.push('Penalty basis has not been selected. Configure it in Payments if contractual penalties apply; no basis will be invented.');return {batch:candidate,preview:{...preview,cutoffDate,clientCount:1,accountCount:1,readyRows:preview.errors.length?0:batch.rows.filter(r=>!r.excluded).length,invalidRecords:preview.errors.length,duplicateRecords:preview.errors.filter(e=>/duplicate|receipt.*used/i.test(e)).length,commissionHold:candidate.reconciliation.commissionReview==='PENDING',backup:'A verified server restore point will be created automatically before import.'},result};
}
