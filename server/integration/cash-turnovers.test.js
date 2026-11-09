import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import User from '../src/models/User.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import CashLedgerEntry from '../src/models/CashLedgerEntry.js';
import {signAccessToken} from '../src/utils/jwt.js';
test('owner cash turnover permissions, balance validation, idempotency, corrections and concurrent spending',{skip:!process.env.CPM_CASH_TEST_URI},async()=>{
 await mongoose.connect(process.env.CPM_CASH_TEST_URI,{dbName:'cash_turnover_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='cash-test';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
 const tokens={};for(const role of ['ADMIN','STAFF']){const u=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Cash',email:role+'@test.local',passwordHash:'unused',role});tokens[role]=signAccessToken(u)}
 const call=async(path,body,expected=200,role='ADMIN')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api/finance${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(expected!==null)assert.equal(response.status,expected,JSON.stringify(result));return {status:response.status,...result}};
 const input=(kind,amount,date='2026-11-01')=>({kind,amount,effectiveDate:date,reason:kind==='OWNER_TURNOVER'?'':'Opening or independent cash',recipient:kind==='OWNER_TURNOVER'?'Owner':'',requestId:randomUUID(),confirm:true,coverageConfirmed:true});
 await call('/cash-ledger',input('OPENING','0'),201);await PropertyAssignment.collection.insertOne({assignmentId:'CASH-SOURCE',payments:[{paymentId:'PAY-CASH',requestId:randomUUID(),paymentDate:'2026-11-01',amountCents:1500000,method:'CASH'},{paymentId:'PAY-DIGITAL',requestId:randomUUID(),paymentDate:'2026-11-01',amountCents:5000000,method:'GCASH'},{paymentId:'PAY-VOID',requestId:randomUUID(),paymentDate:'2026-11-01',amountCents:9990000,method:'CASH',voided:true}],commissionPayouts:[]});
 if(process.env.CPM_INTENT_TRANSACTIONS!=='true'){await call('/cash-ledger',input('OWNER_TURNOVER','1'),409);assert.equal(await CashLedgerEntry.countDocuments({kind:'OWNER_TURNOVER'}),0);return;}
 const request=input('OWNER_TURNOVER','10000','2026-11-02');await call('/cash-ledger',request,403,'STAFF');const posted=await call('/cash-ledger',request,201);await call('/cash-ledger',request);assert.equal(await CashLedgerEntry.countDocuments({kind:'OWNER_TURNOVER'}),1);
 await call('/cash-ledger',input('OWNER_TURNOVER','5000.01','2026-11-03'),409);assert.equal(await CashLedgerEntry.countDocuments({kind:'OWNER_TURNOVER'}),1);
 await call('/cash-ledger',input('OWNER_TURNOVER','1','2026-10-31'),409);
 const body={amount:'9000',effectiveDate:'2026-11-02',recipient:'Owner updated',reference:'SIGNED-1',reason:'Retained balance',correctionReason:'Correct recorded amount',expectedVersion:posted.data.__v,confirm:true};
 const corrected=await call(`/cash-ledger/${posted.data._id}/correct`,body);assert.equal(corrected.data.amountCents,900000);assert.equal(corrected.data.history.at(-1).previousValues.amountCents,1000000);await call(`/cash-ledger/${posted.data._id}/correct`,body,409);
 await call(`/cash-ledger/${posted.data._id}/correct`,{...body,amount:'16000',expectedVersion:corrected.data.__v},409);assert.equal((await CashLedgerEntry.findById(posted.data._id)).amountCents,900000);
 const outcomes=await Promise.all([call('/cash-ledger',input('OWNER_TURNOVER','4000','2026-11-03'),null),call('/cash-ledger',input('OWNER_TURNOVER','4000','2026-11-03'),null)]);assert.deepEqual(outcomes.map(r=>r.status).sort(),[201,409]);
 const history=await call('/cash-ledger?paged=1&kind=OWNER_TURNOVER&q=Owner');assert.equal(history.data.count,2);
 const inflow=await CashLedgerEntry.findOne({kind:'OPENING'});await call(`/cash-ledger/${inflow._id}/void`,{reason:'Testing unsafe past void',expectedVersion:inflow.__v,confirm:true},409);assert.equal((await CashLedgerEntry.findById(inflow._id)).status,'POSTED');
 const report=(await call('/reports/collections?from=2026-11-01&to=2026-11-09')).data;assert.equal(report.cash.closingCents,200000);assert.equal(report.cash.turnoversCents,1300000);assert.equal(report.totalExpensesCents,0);assert.equal(report.totalCollectionsCents,6500000);assert.equal(report.cash.collectionsCents,1500000);assert.equal(await CashLedgerEntry.countDocuments({kind:'INFLOW'}),0);
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r))}
});
