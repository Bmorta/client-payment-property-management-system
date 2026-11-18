import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import mongoose from 'mongoose';
import Property from '../src/models/Property.js';
import Account from '../src/models/PropertyAssignment.js';
import Reservation from '../src/models/Reservation.js';
import Client from '../src/models/Client.js';
import Project from '../src/models/Project.js';
import ReceiptClaim from '../src/models/ReceiptClaim.js';
import {postReservation,previewConversion,convertReservation,expireReservations,manageReservation,addDays} from '../src/services/reservationService.js';
import {loadFinancialData} from '../src/services/financialReportService.js';
import {summarizeAccount,today} from '../src/utils/accounting.js';

test('reservation and conversion commit once, and expiry requires explicit lot release',
  {skip:!process.env.CPM_TEST_REPLICA_URI},async()=>{
  const dbName='rems_reservation_test_'+randomUUID().replaceAll('-','');
  await mongoose.connect(process.env.CPM_TEST_REPLICA_URI,{dbName});
  try {
    await Promise.all([Property,Account,Reservation,Client,Project,ReceiptClaim].map(model=>model.init()));
    const user={_id:new mongoose.Types.ObjectId(),role:'ADMIN',username:'reservation-test'};
    const client=await Client.create({clientId:'CL-1',firstName:'Test',lastName:'Buyer',status:'PROSPECT',createdBy:user._id});
    const project=await Project.create({projectId:'PRJ-1',projectName:'Test Project',projectCode:'TEST',status:'ACTIVE',createdBy:user._id});
    const newLot=number=>Property.create({propertyId:'PROP-'+number,project:project._id,phaseNumber:1,blockNumber:1,lotNumber:number,areaSqm:100,pricePerSqm:5000,createdBy:user._id});
    const lot=await newLot(1);
    const day=today();
    const request={propertyId:String(lot._id),clientId:String(client._id),requestId:randomUUID(),paymentDate:day,
      amount:'5000',method:'CASH',receiptNumber:'TEST-RES-1',terms:'Apply fee toward the down payment',creditPolicy:'DOWN_PAYMENT',confirmed:true};
    const hold=await postReservation(request,user);
    assert.equal(String((await postReservation(request,user))._id),String(hold._id));
    await assert.rejects(postReservation({...request,requestId:randomUUID(),receiptNumber:'TEST-RES-DUP'},user),/already has a hold/);
    assert.equal((await Property.findById(lot._id)).status,'RESERVED');
    assert.equal(await Account.countDocuments(),0);
    assert.equal((await Client.findById(client._id)).status,'PROSPECT');
    const input={months:60,firstDueDate:addDays(day,30),downPayment:'50000',installment:0,method:'CASH',receiptNumber:'TEST-DP-1',reason:'Approved contract'};
    const preview=await previewConversion(String(hold._id),input);
    assert.equal(preview.additionalCents,4500000);
    const approved={...input,token:preview.token,confirmed:true};
    const converted=await convertReservation(String(hold._id),approved,user);
    assert.equal(String((await convertReservation(String(hold._id),approved,user)).account),String(converted.account));
    const account=await Account.findById(converted.account).lean();
    assert.equal(account.payments.length,1);
    assert.equal(summarizeAccount(account).downPaymentPaidCents,5000000);
    assert.equal((await Property.findById(lot._id)).status,'SOLD');
    assert.equal((await Client.findById(client._id)).status,'ACTIVE');
    const data=await loadFinancialData(day,null,{compact:true});
    assert.equal(data.collections.reduce((n,row)=>n+row.amountCents,0),5000000);

    const second=await newLot(2);
    const expiring=await postReservation({...request,propertyId:String(second._id),requestId:randomUUID(),receiptNumber:'TEST-RES-2'},user);
    await Reservation.updateOne({_id:expiring._id},{$set:{expiresOn:addDays(day,-1)}});
    await expireReservations();
    const expired=await Reservation.findById(expiring._id);
    assert.equal(expired.status,'EXPIRED');
    assert.equal((await Property.findById(second._id)).status,'RESERVED');
    await manageReservation(String(expired._id),{action:'RELEASE',reason:'Hold expired',version:expired.__v,confirmed:true},user);
    assert.equal((await Property.findById(second._id)).status,'AVAILABLE');
    assert.equal((await Reservation.findById(expiring._id)).disposition,'OUTSTANDING');
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
