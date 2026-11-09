import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Client from '../src/models/Client.js';
import Project from '../src/models/Project.js';
import Property from '../src/models/Property.js';
import Agent from '../src/models/Agent.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import {signAccessToken} from '../src/utils/jwt.js';
import {calculateCommissions} from '../src/utils/commissionLedger.js';
import {allocatePayments} from '../src/utils/paymentLedger.js';
test('paid-before-assignment with different terms, reviewed legacy correction, release and protected bulk cleanup',{skip:!process.env.CPM_BUYER_COMMISSION_TEST_URI,timeout:60000},async()=>{
 await mongoose.connect(process.env.CPM_BUYER_COMMISSION_TEST_URI,{dbName:'buyer_commission_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='isolated-buyer-commission';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
 const users={},tokens={};for(const role of ['ADMIN','STAFF']){users[role]=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Commission',email:role+'@commission.test',passwordHash:'unused',role});tokens[role]=signAccessToken(users[role])}
 const raw=(path,method='GET',body,role='ADMIN')=>fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const api=async(path,method='GET',body,status=200,role='ADMIN')=>{const r=await raw(path,method,body,role),j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data};
 const client=await Client.create({clientId:'CL-BUYER',firstName:'Paid First',lastName:'Buyer',createdBy:users.ADMIN._id}),project=await Project.create({projectId:'PRJ-BUYER',projectCode:'BUYER',projectName:'Buyer Project',createdBy:users.ADMIN._id}),agent=await Agent.create({agentId:'AGT-BUYER',fullName:'Agent Assigned Later',agentType:'Sales',status:'ACTIVE',createdBy:users.ADMIN._id}),property=await Property.create({propertyId:'PROP-BUYER',project:project._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:2500,createdBy:users.ADMIN._id});
 const a=await api(`/clients/${client._id}/assignments`,'POST',{propertyId:String(property._id),months:36,downPayment:0,contractDate:'2026-01-01',firstDueDate:'2026-01-09'},201),path=`/commissions/accounts/${a._id}`;
 await api('/finance/payments','POST',{accountId:a._id,amount:6945,paymentDate:'2026-01-09',type:'INSTALLMENT',method:'CASH',receiptNumber:'OR-PAID-FIRST',requestId:randomUUID()},201);
 let details=await api(path);const body={percentage:12,termMonths:24,agents:[{agent:String(agent._id),percentage:12}],effectiveMode:'CONTRACT_DATE',expectedVersion:details.__v,confirm:true,reason:'Original sale agreement applies to prior payment'};
 const preview=(await api(path+'/agreement-preview','POST',body)).reconciliation;assert.equal(preview.earnedCents,125000);assert.equal(preview.agents[0].completedInstallments,1);
 await api(path+'/agreement','PUT',{...body,previewToken:preview.token,confirmRetroactive:true});
 let list=await api('/commissions?status=UNRELEASED&account='+a._id);assert.equal(list.total,1);assert.equal(list.summary.releasableCents,125000);
 details=await api(path);await api(path+'/payouts','POST',{expectedVersion:details.__v,confirm:true,requestId:randomUUID(),commissionId:details.snapshot.records[0].commissionId,amount:500,releaseDate:'2026-01-10',method:'CASH'},201);
 // Simulate an existing saved agreement using the prior collection-bucket rule.
 let saved=await PropertyAssignment.findById(a._id).lean();const paymentsBefore=JSON.stringify(saved.payments),payoutsBefore=JSON.stringify(saved.commissionPayouts);saved.commissionAgreement.monthlyEarningRule='FULL_INSTALLMENT_PERIODS';const legacy=calculateCommissions(saved,allocatePayments(saved));await PropertyAssignment.collection.updateOne({_id:saved._id},{$set:{commissionAgreement:saved.commissionAgreement,commissionSnapshot:legacy}});
 let row=(await api('/commissions/reconciliation')).rows.find(r=>r.accountId===String(a._id));assert.equal(row.before.earnedCents,0);assert.equal(row.after.earnedCents,125000);assert.equal(row.after.releasedCents,50000);assert.equal(row.after.releasableCents,75000);
 let current=await PropertyAssignment.findById(a._id).lean();assert.equal(current.commissionAgreement.monthlyEarningRule,'FULL_INSTALLMENT_PERIODS','GET preview must not activate correction');
 await api(path+'/reconcile','POST',{expectedVersion:row.expectedVersion,token:row.token,confirm:true,reason:'Reviewed fixed commission for completed buyer installment'},403,'STAFF');
 await api(path+'/reconcile','POST',{expectedVersion:row.expectedVersion,token:'stale',confirm:true,reason:'Reject stale financial preview'},409);
 await api(path+'/reconcile','POST',{expectedVersion:row.expectedVersion,token:row.token,confirm:true,reason:'Reviewed fixed commission for completed buyer installment'});
 current=await PropertyAssignment.findById(a._id).lean();assert.equal(JSON.stringify(current.payments),paymentsBefore);assert.equal(JSON.stringify(current.commissionPayouts),payoutsBefore);assert.ok(current.commissionAgreementHistory.at(-1).previousValues.monthlyEarningRule==='FULL_INSTALLMENT_PERIODS');
 row=(await api('/commissions/reconciliation')).rows.find(r=>r.accountId===String(a._id));assert.equal(row.needsReconciliation,false);const eventCount=current.commissionEvents.length;await api(path+'/reconcile','POST',{expectedVersion:row.expectedVersion,token:row.token,confirm:true,reason:'Repeat confirmed review'});assert.equal((await PropertyAssignment.findById(a._id)).commissionEvents.length,eventCount);
 const register=await api('/finance/reports/payment-register?from=2026-01-01&to=2026-01-31');assert.equal(register.summary.earnedCents,125000);
 const exportResponse=await raw('/commissions/export?format=xlsx&account='+a._id);assert.equal(exportResponse.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await exportResponse.arrayBuffer()));assert.ok(book.worksheets.length>0);
 // Two orphaned zero-budget rows may be removed together; valid future/earned rows cannot.
 const unused=['UNUSED-A','UNUSED-B'].map(commissionId=>({commissionId,agent:String(agent._id),agentId:'AGT-BUYER',type:'MONTHLY',period:99,budgetCents:0,earnedCents:0,collectedCents:0,sourceAllocations:[]}));await PropertyAssignment.collection.updateOne({_id:saved._id},{$push:{'commissionSnapshot.records':{$each:unused}}});details=await api(path);
 const cleanup={commissionIds:unused.map(r=>r.commissionId),expectedVersion:details.__v,confirm:true,reason:'Remove orphaned unused rows after reviewed correction'};
 await api(path+'/unused-entries/delete','POST',cleanup,403,'STAFF');await api(path+'/unused-entries/delete','POST',{...cleanup,commissionIds:[...cleanup.commissionIds,details.snapshot.records[1].commissionId]},409);
 await api(path+'/unused-entries/delete','POST',cleanup);details=await api(path);assert.ok(unused.every(r=>!details.snapshot.records.some(s=>s.commissionId===r.commissionId)));assert.equal(details.payouts.length,1);assert.equal(details.snapshot.records[0].earnedCents,125000);assert.equal(details.agreement.prunedCommissionIds.length,2);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
