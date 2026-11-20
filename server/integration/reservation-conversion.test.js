import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import Client from '../src/models/Client.js';
import Property from '../src/models/Property.js';
import Project from '../src/models/Project.js';
import Reservation from '../src/models/Reservation.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import ReceiptClaim from '../src/models/ReceiptClaim.js';
import {postReservation,postPrecontractPayment,previewConversion,convertReservation,manageReservation} from '../src/services/reservationService.js';
import {loadFinancialData} from '../src/services/financialReportService.js';
import {summarizeAccount,today} from '../src/utils/accounting.js';

test('protected reservation deposits, draft and conversion preserve original receipts and post no duplicate cash',{skip:!process.env.CPM_CONVERSION_TEST_URI},async()=>{
 const dbName='conversion_test_'+randomUUID().replaceAll('-','');
 await mongoose.connect(process.env.CPM_CONVERSION_TEST_URI,{dbName});
 try{
  await Promise.all([Reservation.init(),PropertyAssignment.init(),ReceiptClaim.init(),Property.init(),Project.init(),Client.init()]);
  const user={_id:new mongoose.Types.ObjectId(),username:'conversion-test',role:'ADMIN'},day=today();
  const client=await Client.create({clientId:'CL-TEST',firstName:'Test',lastName:'Buyer',status:'PROSPECT',createdBy:user._id});
  const project=await Project.create({projectId:'PRJ-TEST',projectCode:'TEST',projectName:'Test Project',status:'ACTIVE',createdBy:user._id});
  const property=await Property.create({propertyId:'PROP-TEST',project:project._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:5000,createdBy:user._id});
  const hold=await postReservation({clientId:String(client._id),propertyId:String(property._id),requestId:randomUUID(),paymentDate:day,amount:5000,method:'CASH',receiptNumber:'TEST-RES',terms:'Test credit toward down payment',creditPolicy:'DOWN_PAYMENT',confirmed:true},user);
  const depositInput={clientId:String(client._id),propertyId:String(property._id),requestId:randomUUID(),paymentDate:day,amount:45000,method:'CASH',receiptNumber:'TEST-DP',confirmed:true};
  const deposit=await postPrecontractPayment(String(hold._id),depositInput,user);
  assert.equal((await postPrecontractPayment(String(hold._id),depositInput,user)).paymentId,deposit.paymentId);
  assert.equal((await Client.findById(client._id)).status,'PROSPECT');
  assert.equal(await PropertyAssignment.countDocuments(),0);
  const payload={months:60,firstDueDate:day,contractDate:day,downPayment:50000,installment:0,additionalAmount:0,reason:'Approved contract'};
  const current=await Reservation.findById(hold._id);
  await manageReservation(String(hold._id),{...payload,action:'DRAFT',version:current.__v,confirmed:true},user);
  assert.equal(await PropertyAssignment.countDocuments(),0);
  const before=await loadFinancialData(day);assert.equal(before.collections.reduce((n,p)=>n+p.amountCents,0),5000000);
  const plan=await previewConversion(String(hold._id),payload);
  assert.equal(plan.additionalCents,0);assert.equal(plan.remainingDownPaymentCents,0);
  const converted=await convertReservation(String(hold._id),{...payload,token:plan.token,confirmed:true},user);
  await convertReservation(String(hold._id),{...payload,token:plan.token,confirmed:true},user);
  assert.equal(await PropertyAssignment.countDocuments(),1);
  assert.equal((await Client.findById(client._id)).status,'ACTIVE');
  assert.equal((await Property.findById(property._id)).status,'SOLD');
  const account=await PropertyAssignment.findById(converted.account).lean();
  assert.equal(account.payments.length,1);assert.equal(account.payments[0].paymentId,deposit.paymentId);
  assert.equal(account.payments[0].receiptNumber,'TEST-DP');assert.equal(summarizeAccount(account,day).balanceCents,45000000);
  assert.equal(String((await ReceiptClaim.findOne({paymentId:deposit.paymentId})).accountId),String(account._id));
  const after=await loadFinancialData(day);assert.equal(after.collections.reduce((n,p)=>n+p.amountCents,0),5000000);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();}
});
