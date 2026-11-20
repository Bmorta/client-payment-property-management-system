import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSchedule,summarizeAccount} from '../src/utils/accounting.js';
import {financialRows} from '../src/utils/financialReporting.js';
import {inventorySummary} from '../src/utils/inventorySummary.js';
import {salesMonitoring,saleMovements} from '../src/utils/salesMonitoring.js';
import {saleInventoryStatus} from '../src/utils/salesClassification.js';

const today='2026-11-20',project={_id:'P',projectName:'Test Project',status:'ACTIVE'},currency=n=>n*100;
function account(id,{price=500000,dp=50000,receipt=dp,date='2026-11-01',agent='A',property=id}={}){
 return {_id:id,assignmentId:'CTR-'+id,project:'P',property,client:'C-'+id,lifecycle:'ACTIVE',contract:{contractDate:date,firstDueDate:'2026-12-05',totalCents:currency(price),downPaymentCents:currency(dp),months:30,schedule:buildSchedule(currency(price),30,'2026-12-05',currency(dp),date)},payments:receipt?[{paymentId:'PAY-'+id,paymentDate:date,type:'DOWN_PAYMENT',amountCents:currency(receipt),method:'BANK_TRANSFER'}]:[],commissionAgreement:{version:1,percentageBps:500,termMonths:30,agents:[{agent,agentId:agent,percentageBps:500}]}};
}
const lot=(id,status='RESERVED',client='C-'+id)=>({_id:id,propertyId:'LOT-'+id,project:'P',phaseNumber:1,blockNumber:1,lotNumber:Number(id.replace(/\D/g,''))||1,areaSqm:100,pricePerSqm:5000,status,client});
const options={from:'2026-11-01',to:today,today,projects:[project],agents:[{_id:'A',fullName:'Agent A'},{_id:'B',fullName:'Agent B'}]};
test('effective status reconciles a direct sale without mutating saved inventory',()=>{
 const a=account('1'),p=lot('1'),before=JSON.stringify(p);
 assert.equal(saleInventoryStatus(p,[a]),'SOLD');
 assert.equal(saleInventoryStatus({...p,reservation:'hold'},[a]),'RESERVED');
 assert.equal(saleInventoryStatus(p,[a,{...a,_id:'duplicate'}]),'RESERVED');
 assert.equal(saleInventoryStatus(p,[{...a,lifecycle:'ASSUMED'}]),'RESERVED');
 assert.equal(saleInventoryStatus(p,[a],'ARCHIVED'),'UNAVAILABLE');
 const result=inventorySummary([p],[project],[a],{},today);
 assert.equal(result.summary.sold,1);assert.equal(result.summary.reserved,0);assert.equal(result.summary.soldContracts,1);assert.equal(result.details[0].savedStatus,'RESERVED');assert.equal(JSON.stringify(p),before);
});
test('reservation receipts count on receipt date exactly once before and after conversion',()=>{
 const a=account('1',{receipt:40000,date:today});a.reservationCredit={reservationCreditId:'R',paymentId:'CREDIT-R',amountCents:1000000,paymentDate:today,allocationPlan:[{installmentId:'I0',amountCents:1000000}]};
 const reservation={_id:'R',property:'1',project:'P',agent:'A',account:'1',startDate:'2026-11-15',expiresOn:'2026-11-30',status:'CONVERTED',history:[{action:'CONVERTED',timestamp:'2026-11-20T02:00:00Z'}]};
 const fee={reservationId:'R',property:'1',project:'P',paymentDate:'2026-11-15',paymentId:'RES-R',type:'RESERVATION_FEE',posted:true,amountCents:1000000},receipts=[...financialRows([a],[]).collections,fee];
 const p=lot('1','SOLD');
 const converted=inventorySummary([p],[project],[a],{from:today,to:today},today,receipts,[reservation]);
 assert.equal(converted.summary.collectionsCents,4000000);assert.equal(converted.summary.outstandingCents,45000000);assert.equal(converted.summary.reservationCollectedCents,0);
 const before=inventorySummary([{...p,status:'RESERVED',reservation:'R',client:null}],[project],[],{},today,[fee],[{...reservation,status:'ACTIVE'}]);
 assert.equal(before.summary.collectionsCents,1000000);assert.equal(before.summary.soldContracts,0);assert.equal(before.summary.reservationCollectedCents,1000000);
 const report=salesMonitoring({...options,accounts:[a],properties:[p],reservations:[reservation],collections:receipts});
 assert.equal(report.summary.collectionsCents,5000000);assert.equal(report.summary.currentValueCents,50000000);assert.equal(report.summary.receivableCents,45000000);assert.equal(report.summary.conversionRate,1);assert.equal(report.summary.earnedCents,200000);
});
test('closed contracts retain posted receipts but not current principal and gross period includes original booking',()=>{
 const a=account('1'),b=account('2',{price:300000,dp:30000,date:'2026-10-01'}),c=account('3',{price:350000,dp:70000,date:'2026-11-02'});
 b.forfeiturePeriods=[{periodId:'F',effectiveDate:'2026-11-14',beforeContract:b.contract,beforeLedger:summarizeAccount(b,'2026-11-14')}];b.lifecycle='FORFEITED';
 c.cancellationOut={effectiveDate:'2026-11-12',beforeLedger:summarizeAccount(c,'2026-11-12')};c.lifecycle='CANCELLED';
 const accounts=[a,b,c],properties=[lot('1'),lot('2','UNAVAILABLE'),lot('3','UNAVAILABLE')],snapshot=JSON.stringify(accounts);
 const d=salesMonitoring({...options,accounts,properties});
 assert.equal(d.summary.newContracts,2);assert.equal(d.summary.grossSalesCents,85000000);assert.equal(d.summary.cancelledCents,35000000);assert.equal(d.summary.forfeitedCents,30000000);assert.equal(d.summary.netMovementCents,20000000);assert.equal(d.summary.activeContracts,1);assert.equal(d.summary.currentValueCents,50000000);assert.equal(d.summary.receivableCents,45000000);assert.equal(d.summary.collectionsCents,12000000);assert.equal(JSON.stringify(accounts),snapshot);
 const beforeClosures=salesMonitoring({...options,to:'2026-11-10',accounts,properties});
 assert.equal(beforeClosures.summary.closingContractValueCents,115000000);
 assert.equal(beforeClosures.summary.closingReceivableCents,100000000);
});
test('replacement does not book new sale; reactivation replacement does not restore old contract twice',()=>{
 const source=account('1');source.transferOut={effectiveDate:'2026-11-12'};source.lifecycle='TRANSFERRED';
 const replacement=account('2',{price:600000,date:'2026-11-12',receipt:0});replacement.transferIn={sourceId:'1',effectiveDate:'2026-11-12',creditCents:0};
 const movements=[...saleMovements(source).events,...saleMovements(replacement).events];
 assert.equal(movements.filter(e=>e.kind==='ORIGINAL_SALE').length,1);assert.equal(movements.reduce((n,e)=>n+e.amountCents,0),60000000);
 const f=account('3');f.lifecycle='SUPERSEDED';f.forfeiturePeriods=[{effectiveDate:'2026-11-05',reactivatedAt:'2026-11-10',replacementId:'4',beforeContract:f.contract}];
 assert.deepEqual(saleMovements(f).events.map(e=>e.kind),['ORIGINAL_SALE','FORFEITED']);
 const next=account('4',{date:'2026-11-10'});next.transferIn={sourceId:'3',effectiveDate:'2026-11-10'};next.reactivationIn={sourceId:'3'};
 assert.equal(saleMovements(next).events[0].kind,'REPLACEMENT_IN');
});
test('original booking price and approved correction delta are separate; no duplicate co-agent sales',()=>{
 const a=account('1');const original=structuredClone(a.contract);a.contract.totalCents=55000000;a.contract.schedule=buildSchedule(55000000,30,'2026-12-05',5000000,'2026-11-01');a.financialCorrections=[{effectiveDate:'2026-11-10',currentContract:original,correctedContract:a.contract}];
 const events=saleMovements(a).events;assert.deepEqual(events.map(e=>e.amountCents),[50000000,5000000]);
 const shared=account('2');shared.commissionAgreement.agents=[{agent:'A',agentId:'A',percentageBps:250},{agent:'B',agentId:'B',percentageBps:250}];
 const d=salesMonitoring({...options,accounts:[shared],properties:[lot('2')]});
 assert.equal(d.summary.grossSalesCents,50000000);assert.equal(d.summary.newContracts,1);assert.equal(d.agents.length,2);assert.equal(d.agents[0].grossSalesCents,50000000);assert.equal(d.agents[1].grossSalesCents,50000000);
 const filtered=salesMonitoring({...options,accounts:[shared],properties:[lot('2')],agent:'B'});assert.equal(filtered.summary.newContracts,1);assert.equal(filtered.summary.earnedCents,125000);
});
test('voided and draft payment receipts are not included; unknown historical reversal is flagged',()=>{
 const a=account('1');a.payments.push({paymentId:'void',paymentDate:today,amountCents:50000,voided:true},{paymentId:'draft',paymentDate:today,amountCents:50000,status:'DRAFT'});
 const closed={...account('2'),lifecycle:'CANCELLED'};
 const d=salesMonitoring({...options,accounts:[a,closed],properties:[lot('1'),lot('2','UNAVAILABLE')]});
 assert.equal(d.summary.collectionsCents,10000000);assert.equal(d.summary.currentValueCents,50000000);assert.ok(d.warnings.some(w=>w.includes('no verified movement date')));
 assert.equal(d.summary.closingContractValueCents,null);
});
test('reassigned agent receives commission performance without stealing original sales attribution',()=>{
 const a=account('1'),original=structuredClone(a.commissionAgreement);
 a.commissionAgreement={...original,agents:[{agent:'B',agentId:'B',percentageBps:500}]};
 a.commissionAgreementHistory=[{previousValues:null,updatedValues:original},{previousValues:original,updatedValues:a.commissionAgreement}];
 const result=salesMonitoring({...options,accounts:[a],properties:[lot('1')],agent:'B'});
 assert.equal(result.summary.grossSalesCents,0);assert.equal(result.summary.newContracts,0);assert.equal(result.summary.earnedCents,250000);assert.equal(result.agents[0].id,'B');
});
test('sell-through excludes orphan reservations, conflicting holds and restricted inventory',()=>{
 const a=account('1'),properties=[lot('1','SOLD'),{...lot('2','AVAILABLE'),client:null},{...lot('3','RESERVED'),client:null,reservation:'R3'},{...lot('4','RESERVED'),client:null,reservation:'ORPHAN'},lot('5','UNAVAILABLE'),{...lot('6','AVAILABLE'),client:null}];
 const d=salesMonitoring({...options,accounts:[a],properties,reservations:[{_id:'R3',property:'3',project:'P',held:true,status:'ACTIVE',expiresOn:'2026-11-30',startDate:'2026-11-15'},{_id:'R6',property:'6',project:'P',held:true,status:'ACTIVE',expiresOn:'2026-11-30',startDate:'2026-11-15'}]});
 assert.deepEqual(d.performance.sellThrough,{sold:1,available:1,reserved:1,excluded:3,rate:1/3});
});
test('sales endpoint exports filtered register and totals using the same snapshot',async t=>{
 const {salesMonitoringReport}=await import('../src/controllers/salesMonitoringController.js');
 const {today:currentDay}=await import('../src/utils/accounting.js');
 const names=['Property','Project','PropertyAssignment','Client','Agent','Reservation','Company','SalesPlanningRecord'];
 const models=Object.fromEntries(await Promise.all(names.map(async n=>[n,(await import('../src/models/'+n+'.js')).default])));
 const p='aaaaaaaaaaaaaaaaaaaaaaaa',a=account('1');a.project=p;
 const data={Property:[{...lot('1'),project:p}],Project:[{...project,_id:p}],PropertyAssignment:[a],Client:[],Agent:options.agents,Reservation:[],Company:[],SalesPlanningRecord:[]};
 for(const n of names)t.mock.method(models[n],'find',()=>({limit(){return this},select(){return this},sort(){return this},populate(){return this},lean:async()=>data[n]}));
 const target={_id:'target:MONTH:2026-11:COMPANY:OFFICE',version:1,value:{periodType:'MONTH',period:'2026-11',scope:'COMPANY',subject:'',valueCents:100000000,units:2,active:true}};
 t.mock.method(models.SalesPlanningRecord,'find',filter=>({select(){return this},lean:async()=>filter.kind==='TARGET'?[target]:[]}));
 const query={from:'2026-11-01',to:currentDay()};
 const res={set(){return this},json(x){this.body=x;return this},type(){return this},attachment(){return this},send(x){this.bytes=x;return this}};
 await salesMonitoringReport({query},res,e=>{throw e});
 assert.equal(res.body.data.summary.grossSalesCents,50000000);
 await salesMonitoringReport({query:{...query,format:'xlsx',expectedSnapshot:res.body.data.snapshot}},res,e=>{throw e});
 const {default:ExcelJS}=await import('exceljs'),book=new ExcelJS.Workbook();await book.xlsx.load(res.bytes);
 assert.equal(book.getWorksheet('Sales Register').getRow(2).getCell(1).value,'CTR-1');
 assert.equal(book.getWorksheet('Sales Register').getRow(2).getCell(10).value,500000);
 assert.equal(book.getWorksheet('Movements').rowCount,2);
 assert.equal(book.getWorksheet('Actual Receipts').getRow(2).getCell(7).value,50000);
 assert.ok(book.getWorksheet('Calendar Targets'));assert.equal(book.getWorksheet('YoY Comparison').getRow(2).getCell(4).value,500000);
 assert.equal(book.getWorksheet('Calendar Targets').getRow(2).getCell(4).value,1000000);
 assert.equal(book.getWorksheet('Calendar Targets').getRow(2).getCell(5).value,500000);
 const {Writable}=await import('node:stream'),chunks=[];
 const pdf=new Writable({write(chunk,_encoding,callback){chunks.push(Buffer.from(chunk));callback()}});
 pdf.type=pdf.attachment=pdf.set=()=>pdf;
 const finished=new Promise((resolve,reject)=>{pdf.on('finish',resolve);pdf.on('error',reject)});
 await salesMonitoringReport({query:{...query,format:'pdf',expectedSnapshot:res.body.data.snapshot}},pdf,e=>{throw e});
 await finished;assert.equal(Buffer.concat(chunks).subarray(0,4).toString(),'%PDF');
 target.value.valueCents=120000000;
 await assert.rejects(()=>salesMonitoringReport({query:{...query,format:'xlsx',expectedSnapshot:res.body.data.snapshot}},res,e=>{throw e}),/changed/);
 await assert.rejects(()=>salesMonitoringReport({query:{...query,format:'xlsx',expectedSnapshot:'stale'}},res,e=>{throw e}),/changed/);
});
