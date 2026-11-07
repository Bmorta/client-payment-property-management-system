import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Client from '../src/models/Client.js';
import Project from '../src/models/Project.js';
import Property from '../src/models/Property.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import MigrationBatch from '../src/models/MigrationBatch.js';
import MigrationConfig from '../src/models/MigrationConfig.js';
import ReceiptClaim from '../src/models/ReceiptClaim.js';
import {signAccessToken} from '../src/utils/jwt.js';
import {buildSchedule,today} from '../src/utils/accounting.js';

test('historical migration HTTP workflow, staging, reconciliation and transactional activation',{skip:!process.env.CPM_MIGRATION_TEST_URI},async()=>{
 const name=`cpm_migration_test_${randomUUID().replaceAll('-','')}`;await mongoose.connect(process.env.CPM_MIGRATION_TEST_URI,{dbName:name});
 process.env.JWT_SECRET||='isolated-migration-test-secret';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const url=`http://127.0.0.1:${server.address().port}/api`;
 try{
  await Promise.all([User.init(),MigrationBatch.init(),MigrationConfig.init(),ReceiptClaim.init(),PropertyAssignment.init()]);
  const users={},tokens={};for(const role of ['ADMIN','STAFF','VIEWER']){users[role]=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Test',email:`${role}@test.local`,passwordHash:'unused',role});tokens[role]=signAccessToken(users[role])}
  async function api(path,method='GET',body,role='ADMIN',status=200){const r=await fetch(url+path,{method,headers:{Authorization:`Bearer ${tokens[role]}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});let data;try{data=await r.json()}catch{throw new Error(`Not JSON ${path}: ${r.status}`)}assert.equal(r.status,status,`${path}: ${JSON.stringify(data)}`);return data.data}
  const client=await Client.create({clientId:'CL-001',firstName:'Historical',lastName:'Buyer',createdBy:users.ADMIN._id});const project=await Project.create({projectId:'PRJ-MIG',projectName:'Migration Test',projectCode:'MIG',createdBy:users.ADMIN._id});
  async function createAccount(num=1,months=12){const property=await Property.create({propertyId:`PROP-MIG${num}`,project:project._id,phaseNumber:1,blockNumber:1,lotNumber:num,areaSqm:100,pricePerSqm:720,createdBy:users.ADMIN._id});return PropertyAssignment.create({assignmentId:`CTR-MIG${num}`,client:client._id,project:project._id,property:property._id,contract:{totalCents:7200000,downPaymentCents:0,months,contractDate:'2022-01-01',firstDueDate:'2022-02-05',schedule:buildSchedule(7200000,months,'2022-02-05',0,'2022-01-01')},createdBy:users.ADMIN._id})}
  const a=await createAccount();await api('/migration','GET',null,'VIEWER',403);
  assert.equal((await api('/migration/config')).preparationMode,true);
  let prep=await api('/migration/batches','POST',{accountId:String(a._id)},'STAFF');assert.equal(prep.cutoffDate,null);const prepPath=`/migration/batches/${prep._id}`;
  const liveBefore=JSON.stringify(await PropertyAssignment.findById(a._id).lean()),cashBefore=(await api(`/finance/reports/collections?from=${today()}&to=${today()}`)).cash;
  const prepRow={kind:'PAYMENT',date:'2022-02-05',receiptNumber:'000PREP1',series:'PREPARATION',type:'INSTALLMENT',method:'CASH',amount:1200};
  prep=await api(prepPath,'PATCH',{version:prep.__v,action:'UPSERT_ROW',row:prepRow},'STAFF');
  prep=await api(prepPath,'PATCH',{version:prep.__v,action:'UPSERT_ROW',rowId:prep.rows[0].rowId,row:{...prepRow,amount:1500}},'STAFF');assert.equal(prep.rows[0].amountCents,150000);
  await api(prepPath,'PATCH',{version:prep.__v,action:'UPSERT_ROW',row:{...prepRow,amount:1500}},'STAFF',409);
  const prepTemplate=await fetch(url+'/migration/templates/payments',{headers:{Authorization:`Bearer ${tokens.STAFF}`}}),prepBook=new ExcelJS.Workbook();await prepBook.xlsx.load(Buffer.from(await prepTemplate.arrayBuffer()));
  prepBook.getWorksheet('Records').getRow(2).values=[a.assignmentId,'PAYMENT','2022-03-05','000PREP2','PREPARATION','INSTALLMENT','CASH','',1500];
  const prepFile={filename:'preparation.xlsx',base64:Buffer.from(await prepBook.xlsx.writeBuffer()).toString('base64')};
  const prepImport=await api(prepPath+'/import','POST',prepFile,'STAFF');assert.equal(prepImport.validRows,1);
  prep=await api(prepPath+'/import','POST',{...prepFile,version:prep.__v,save:true,rowNumbers:[2]},'STAFF');assert.equal(prep.rows.length,2);
  assert.equal((await api(prepPath+'/import','POST',{...prepFile,version:prep.__v,save:true,rowNumbers:[2]},'STAFF')).alreadyImported,true);
  prep=await api(prepPath,'PATCH',{version:prep.__v,action:'RECONCILE',reconciliation:{officeBalance:69000,officePenalty:0,historicalStatus:'ACTIVE',expectedPeriods:12,documentReference:'Provisional printed ledger',commissionReview:'NOT_APPLICABLE'}},'STAFF');
  let prepPreview=await api(prepPath+'/preview');assert.equal(prepPreview.balanced,true);assert.equal(prepPreview.preparationMode,true);assert.equal(prepPreview.cutoffDate,null);assert.match(prepPreview.asOf,/^\d{4}-\d{2}-\d{2}$/);
  prep=await api(prepPath+'/workflow','POST',{version:prep.__v,action:'SUBMIT',reason:'Preparation review'},'STAFF');prepPreview=await api(prepPath+'/preview');
  prep=await api(prepPath+'/workflow','POST',{version:prep.__v,action:'VERIFY',reason:'Provisional verification only',token:prepPreview.token});assert.equal(prep.review.preparationMode,true);assert.equal(prep.history.at(-1).preparationMode,true);assert.equal(prep.history.at(-1).cutoffDate,null);
  prepPreview=await api(prepPath+'/preview');await api(prepPath+'/workflow','POST',{version:prep.__v,action:'ACTIVATE',reason:'Must remain blocked',confirm:true,token:prepPreview.token},'ADMIN',409);
  assert.equal(JSON.stringify(await PropertyAssignment.findById(a._id).lean()),liveBefore);assert.deepEqual((await api(`/finance/reports/collections?from=${today()}&to=${today()}`)).cash,cashBefore);assert.equal(await ReceiptClaim.countDocuments(),0);
  assert.equal((await api('/finance/payments?paged=1')).count,0);assert.equal((await api('/migration')).stats.paymentCount,2);
  // Configuration may be saved without an official cutoff. No placeholder date.
  await api('/migration/config','PUT',{cutoffDate:'2026-10-31T00:00:00Z',reason:'Malformed cutoff is not accepted'},'ADMIN',400);
  const prepConfig=await api('/migration/config','PUT',{cutoffDate:'',reason:'Continue planning without go-live date'});assert.equal(prepConfig.cutoffDate,null);
  await api('/migration/config','PUT',{version:prepConfig.__v,cutoffDate:'2026-10-31',reason:'Approved office cutoff',backupReference:'test-backup-verified',recoveryTestReference:'test-recovery-verified'});
  prepPreview=await api(prepPath+'/preview');assert.equal(prepPreview.preparationMode,false);assert.equal(prepPreview.cutoffDate,'2026-10-31');
  await api(prepPath+'/workflow','POST',{version:prep.__v,action:'ACTIVATE',reason:'Old preparation approval is insufficient',confirm:true,token:prepPreview.token},'ADMIN',409);
  prep=await api(prepPath+'/workflow','POST',{version:prep.__v,action:'RETURN',reason:'Reconcile under official cutoff'});
  for(const r of [...prep.rows])prep=await api(prepPath,'PATCH',{version:prep.__v,action:'DELETE_ROW',rowId:r.rowId,reason:'Finish preparation test'},'STAFF');
  let b=await api('/migration/batches','POST',{accountId:String(a._id)},'STAFF');assert.equal(b.status,'IN_PROGRESS');assert.equal((await api('/migration/batches','POST',{accountId:String(a._id)},'STAFF'))._id,b._id);
  const path=`/migration/batches/${b._id}`;const row={kind:'PAYMENT',date:'2022-02-05',receiptNumber:'000001',series:'2022-A',type:'INSTALLMENT',method:'CASH',amount:'15000',documentReference:'Printed ledger p1'};
  await api(path,'PATCH',{version:b.__v,action:'UPSERT_ROW',row},'VIEWER',403);
  b=await api(path,'PATCH',{version:b.__v,action:'UPSERT_ROW',row},'STAFF');assert.equal(b.rows.length,1);assert.equal((await PropertyAssignment.findById(a._id)).payments.length,0);
  await api(path,'PATCH',{version:0,action:'UPSERT_ROW',row:{...row,receiptNumber:'x'}},'STAFF',409);await api(path,'PATCH',{version:b.__v,action:'UPSERT_ROW',row},'STAFF',409);
  let p=await api(path+'/preview');assert.equal(p.paymentCount,1);assert.equal(p.schedule[0].paidCents,600000);assert.equal(p.schedule[1].paidCents,600000);assert.equal(p.schedule[2].paidCents,300000);assert.equal(p.recordedPenaltyCents,0);
  const live=await api('/finance/payments?paged=1&origin=HISTORICAL');assert.equal(live.count,0);
  const bad=await api(path+'/workflow','POST',{action:'SUBMIT',version:b.__v,reason:'Ready'},'STAFF',409);
  b=await api(path,'PATCH',{version:b.__v,action:'RECONCILE',reconciliation:{officeBalance:57000,officePenalty:0,historicalStatus:'ACTIVE',expectedPeriods:12,documentReference:'Printed ledger verified',commissionReview:'NOT_APPLICABLE'}},'STAFF');p=await api(path+'/preview');assert.deepEqual(p.errors,[]);
  b=await api(path+'/workflow','POST',{version:b.__v,action:'SUBMIT',reason:'Original receipts checked'},'STAFF');await api(path+'/workflow','POST',{version:b.__v,action:'VERIFY',reason:'Checked',token:p.token},'STAFF',403);
  p=await api(path+'/preview');b=await api(path+'/workflow','POST',{version:b.__v,action:'VERIFY',reason:'Verified printed ledger',token:p.token});assert.equal(b.status,'VERIFIED');assert.equal((await PropertyAssignment.findById(a._id)).payments.length,0);
  p=await api(path+'/preview');const activateBody={version:b.__v,action:'ACTIVATE',reason:'Approved activation',confirm:true,token:p.token};
  const hello=await mongoose.connection.db.admin().command({hello:1});
  if(!hello.setName){await api(path+'/workflow','POST',activateBody,'ADMIN',409);assert.equal((await PropertyAssignment.findById(a._id)).payments.length,0);assert.equal(await ReceiptClaim.countDocuments(),0);assert.equal((await MigrationBatch.findById(b._id)).status,'VERIFIED');return}
  const activations=await Promise.all([api(path+'/workflow','POST',activateBody),api(path+'/workflow','POST',activateBody)]),activated=activations[0];assert.equal(activated.status,'COMPLETED');assert.equal(activations[1].status,'COMPLETED');assert.equal((await api(path+'/preview')).balanced,true);
  assert.equal((await api(path+'/workflow','POST',{version:b.__v,action:'ACTIVATE',reason:'Retry',confirm:true,token:p.token})).status,'COMPLETED');
  let posted=await PropertyAssignment.findById(a._id).lean();assert.equal(posted.payments.length,1);assert.equal(posted.payments[0].origin,'HISTORICAL');assert.equal(posted.payments[0].paymentDate,'2022-02-05');assert.equal(posted.payments[0].allocations.length,3);assert.equal(await ReceiptClaim.countDocuments(),1);
  await api(path,'PATCH',{version:activated.__v,action:'DELETE_ROW',rowId:b.rows[0].rowId,reason:'No'},'ADMIN',409);
  assert.equal((await api('/finance/payments?paged=1&origin=HISTORICAL')).totalCents,1500000);assert.equal((await api('/finance/payments?paged=1&origin=LIVE')).count,0);assert.equal((await api('/finance/payments?paged=1&from=2026-11-07&to=2026-11-07')).count,0);
  await api('/finance/payments','POST',{accountId:String(a._id),paymentDate:'2022-04-05',requestId:randomUUID(),amount:6000,receiptNumber:'OLDDATE',method:'CASH'},'ADMIN',409);
  const a2=await createAccount(2,60);let b2=await api('/migration/batches','POST',{accountId:String(a2._id)},'STAFF'),p2=`/migration/batches/${b2._id}`;
  b2=await api(p2,'PATCH',{version:b2.__v,action:'UPSERT_ROW',row},'STAFF');assert.ok((await api(p2+'/preview')).errors.some(x=>x.includes('receipt and issuing series')));
  // Valid XLSX: encode a different receipt series, preserving text leading zeros.
  const templateResponse=await fetch(url+'/migration/templates/payments',{headers:{Authorization:`Bearer ${tokens.STAFF}`}});assert.equal(templateResponse.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await templateResponse.arrayBuffer()));const sheet=book.getWorksheet('Records');sheet.getRow(2).values=[a2.assignmentId,'PAYMENT','2022-03-05','000004','2022-B','INSTALLMENT','CASH','',1200,'REF-X','From Excel','Ledger','Page2'];const bytes=Buffer.from(await book.xlsx.writeBuffer()),payload={filename:'history.xlsx',base64:bytes.toString('base64')};
  const parsed=await api(p2+'/import','POST',payload,'STAFF');assert.equal(parsed.validRows,1);assert.equal(parsed.totalPaymentCents,120000);assert.equal(parsed.rows[0].normalized.receiptNumber,'000004');
  b2=await api(p2+'/import','POST',{...payload,version:b2.__v,save:true,rowNumbers:[2]},'STAFF');assert.equal(b2.rows.length,2);assert.equal((await api(p2+'/import','POST',{...payload,version:b2.__v,save:true,rowNumbers:[2]},'STAFF')).alreadyImported,true);assert.equal((await MigrationBatch.findById(b2._id)).rows.length,2);
  await api(p2+'/import','POST',{filename:'bad.xls',base64:'AAAA'},'STAFF',400);
  // Evidence magic validation and authenticated retrieval.
  await api(p2+'/documents','POST',{version:b2.__v,name:'unsafe.png',mime:'image/png',base64:Buffer.from('fake').toString('base64')},'STAFF',400);
  const pdf=Buffer.from('%PDF-1.4\noriginal receipt evidence');const d=await api(p2+'/documents','POST',{version:b2.__v,name:'evidence.pdf',mime:'application/pdf',base64:pdf.toString('base64')},'STAFF');
  const r=await fetch(url+p2+`/documents/${d._id}`,{headers:{Authorization:`Bearer ${tokens.STAFF}`}});assert.equal(r.status,200);assert.equal(Buffer.from(await r.arrayBuffer()).toString(),pdf.toString());assert.equal(r.headers.get('cache-control'),'no-store');
  b2=await api(p2);await api(p2+`/documents/${d._id}`,'DELETE',{version:b2.__v,reason:'Replace blurred scan'},'STAFF');
  assert.equal((await api('/migration')).stats.counts.COMPLETED,1);assert.equal((await api('/migration')).stats.totalAccounts,2);
  await api('/migration/config','PUT',{version:0,cutoffDate:'2026-09-30',reason:'Change cutoff'},'ADMIN',409);
  // A second active admin disallows self-approval of encoded rows.
  const second=await User.create({username:'secondadmin',firstName:'Second',lastName:'Admin',email:'second@test.local',passwordHash:'unused',role:'ADMIN'});
  b2=await api(p2);await api(p2,'PATCH',{version:b2.__v,action:'DELETE_ROW',rowId:b2.rows[0].rowId,reason:'Duplicate excluded'},'ADMIN');b2=await api(p2);
  b2=await api(p2,'PATCH',{version:b2.__v,action:'UPSERT_ROW',row:{...row,receiptNumber:'000005',series:'2022-C',amount:1200,date:'2022-04-05'}},'ADMIN');
  b2=await api(p2,'PATCH',{version:b2.__v,action:'RECONCILE',reconciliation:{officeBalance:69600,officePenalty:0,historicalStatus:'ACTIVE',expectedPeriods:60,documentReference:'60 months checked',commissionReview:'NOT_APPLICABLE'}},'ADMIN');
  b2=await api(p2+'/workflow','POST',{version:b2.__v,action:'SUBMIT',reason:'Checked'},'STAFF');p=await api(p2+'/preview');await api(p2+'/workflow','POST',{version:b2.__v,action:'VERIFY',token:p.token,reason:'Self review',soleAdminReason:'Not permitted'},'ADMIN',403);
  assert.equal((await api(p2+'/preview')).schedule.length,60);
  // Commission and documented penalty reconstruction, no invented payout.
  const a3=await createAccount(3);await PropertyAssignment.updateOne({_id:a3._id},{$set:{commissionAgreement:{version:1,termMonths:12,allocatedBps:1000,agents:[{agent:String(users.STAFF._id),agentId:'AGT-MIG',percentageBps:1000}]}}});
  let b3=await api('/migration/batches','POST',{accountId:String(a3._id)},'STAFF'),p3=`/migration/batches/${b3._id}`;
  async function add3(value){b3=await api(p3,'PATCH',{version:b3.__v,action:'UPSERT_ROW',row:value},'STAFF');return b3.rows.at(-1)}
  await add3({...row,series:'2022-COM',receiptNumber:'000001',amount:6000,date:'2022-02-05'});
  const assessment=await add3({kind:'PENALTY_ASSESSMENT',date:'2022-03-11',amount:180,installment:2,remarks:'Original documented charge',documentReference:'Penalty ledger p2'});
  await add3({kind:'PENALTY_WAIVER',date:'2022-03-12',amount:80,installment:2,assessmentId:`HPA-${assessment.rowId}`,remarks:'Approved historical waiver',documentReference:'Waiver note p2'});
  await add3({...row,series:'2022-COM',receiptNumber:'000002',amount:100,date:'2022-03-13',type:'PENALTY'});
  let cprev=await api(p3+'/preview');const commission=cprev.commissions.find(c=>c.period===1&&c.type==='MONTHLY');assert.equal(commission.earnedCents,60000);assert.equal(cprev.recordedPenaltyCents,0);
  const early=await add3({kind:'COMMISSION',date:'2022-02-01',releaseDate:'2022-02-01',amount:200,earned:600,commissionId:commission.commissionId,method:'CASH',documentReference:'Early payout'});
  assert.ok((await api(p3+'/preview')).errors.some(x=>x.includes('not funded')));
  b3=await api(p3,'PATCH',{version:b3.__v,action:'DELETE_ROW',rowId:early.rowId,reason:'Incorrect original release date'},'STAFF');
  await add3({kind:'COMMISSION',date:'2022-02-05',releaseDate:'2022-02-06',amount:200,earned:600,commissionId:commission.commissionId,method:'CASH',documentReference:'Agent payout original'});
  await add3({kind:'COMMISSION',date:'2022-02-05',releaseDate:'2022-02-07',amount:300,earned:600,commissionId:commission.commissionId,method:'CASH',documentReference:'Agent payout second'});
  b3=await api(p3,'PATCH',{version:b3.__v,action:'RECONCILE',reconciliation:{officeBalance:66000,officePenalty:0,historicalStatus:'ACTIVE',expectedPeriods:12,documentReference:'All original documents',commissionReview:'RECONCILED'}},'STAFF');
  let pv3=await api(p3+'/preview');assert.deepEqual(pv3.errors,[]);b3=await api(p3+'/workflow','POST',{version:b3.__v,action:'SUBMIT',reason:'Reconciled'},'STAFF');pv3=await api(p3+'/preview');b3=await api(p3+'/workflow','POST',{version:b3.__v,action:'VERIFY',reason:'Reviewed',token:pv3.token});pv3=await api(p3+'/preview');
  b3=await api(p3+'/workflow','POST',{version:b3.__v,action:'ACTIVATE',reason:'Approved',confirm:true,token:pv3.token});
  const a3done=await PropertyAssignment.findById(a3._id).lean();assert.equal(a3done.commissionPayouts.length,2);assert.deepEqual(a3done.commissionPayouts.map(p=>p.releaseDate),['2022-02-06','2022-02-07']);assert.equal(a3done.commissionSnapshot.records.find(c=>c.commissionId===commission.commissionId).unreleasedCents,10000);assert.equal(a3done.payments.length,2);assert.equal(a3done.historicalPenalties.length,1);assert.equal((await api(p3+'/preview')).balanced,true);
  // A receipt ownership conflict rolls back every activation write; retry is safe.
  const a4=await createAccount(4);let b4=await api('/migration/batches','POST',{accountId:String(a4._id)},'STAFF'),p4=`/migration/batches/${b4._id}`;
  b4=await api(p4,'PATCH',{version:b4.__v,action:'UPSERT_ROW',row:{...row,receiptNumber:'ROLLBACK-1',series:'2022-ROLL',amount:6000,date:'2022-05-05'}},'STAFF');b4=await api(p4,'PATCH',{version:b4.__v,action:'RECONCILE',reconciliation:{officeBalance:66000,officePenalty:0,historicalStatus:'ACTIVE',expectedPeriods:12,documentReference:'Verified',commissionReview:'NOT_APPLICABLE'}},'STAFF');b4=await api(p4+'/workflow','POST',{version:b4.__v,action:'SUBMIT',reason:'Ready'},'STAFF');let pv4=await api(p4+'/preview');b4=await api(p4+'/workflow','POST',{version:b4.__v,action:'VERIFY',reason:'Checked',token:pv4.token});pv4=await api(p4+'/preview');
  const {createHash}=await import('node:crypto');const receiptKey=createHash('sha256').update(JSON.stringify(['2022-ROLL','ROLLBACK-1'])).digest('hex');await ReceiptClaim.create({_id:receiptKey,scope:'2022-ROLL',receiptNumber:'ROLLBACK-1',accountId:a._id,paymentId:'OWNED',requestId:'other-submission'});
  await api(p4+'/workflow','POST',{version:b4.__v,action:'ACTIVATE',reason:'Try activation',confirm:true,token:pv4.token},'ADMIN',409);assert.equal((await PropertyAssignment.findById(a4._id)).payments.length,0);assert.equal((await MigrationBatch.findById(b4._id)).status,'VERIFIED');
  await ReceiptClaim.deleteOne({_id:receiptKey});await api(p4+'/workflow','POST',{version:b4.__v,action:'ACTIVATE',reason:'Safe retry',confirm:true,token:pv4.token});assert.equal((await PropertyAssignment.findById(a4._id)).payments.length,1);
  // Approved historical transactions use the existing append-only correction path.
  const hp=a3done.payments.find(p=>p.type==='INSTALLMENT'),correctionPath=`/finance/accounts/${a3._id}/payments/${hp.paymentId}/corrections`,correction={requestId:randomUUID(),baseRevision:0,amount:6000,paymentDate:hp.paymentDate,method:'CASH',type:'INSTALLMENT',voided:true,reason:'Original historical receipt was cancelled',confirm:true};
  await api(correctionPath,'POST',{...correction,paymentDate:'2026-11-01'},'ADMIN',409);
  await api(correctionPath,'POST',correction);const corrected=await PropertyAssignment.findById(a3._id).lean();assert.equal(corrected.payments[0].amountCents,600000);assert.equal(corrected.payments[0].revisions.length,1);assert.equal(corrected.commissionPayouts.length,2);assert.equal(corrected.commissionSnapshot.records.find(c=>c.commissionId===commission.commissionId).recoveryDueCents,50000);


 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();await new Promise(r=>server.close(r))}
});
