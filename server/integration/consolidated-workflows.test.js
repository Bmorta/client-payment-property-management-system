import test from 'node:test';import assert from 'node:assert/strict';import mongoose from 'mongoose';import {randomUUID} from 'node:crypto';
import app from '../src/app.js';import User from '../src/models/User.js';import Client from '../src/models/Client.js';import Project from '../src/models/Project.js';import Property from '../src/models/Property.js';import Account from '../src/models/PropertyAssignment.js';import Agent from '../src/models/Agent.js';import CashEntry from '../src/models/CashLedgerEntry.js';import Review from '../src/models/OfficeCashReview.js';import {signAccessToken} from '../src/utils/jwt.js';import {buildSchedule} from '../../shared/paymentSchedule.js';import {calculateCommissions} from '../src/utils/commissionLedger.js';import {allocatePayments} from '../src/utils/paymentLedger.js';import ExcelJS from 'exceljs';
test('scoped agents, multi-filters, full client exports and office cash request/release/reconciliation preserve source records',{skip:!process.env.REMS_CONSOLIDATED_TEST_URI},async()=>{
 await mongoose.connect(process.env.REMS_CONSOLIDATED_TEST_URI,{dbName:'consolidated_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET='consolidated-tests-only';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
 const admin=await User.create({username:'admin',firstName:'Test',lastName:'Admin',email:'admin@test.local',passwordHash:'unused',role:'ADMIN'}),staff=await User.create({username:'staff',firstName:'Test',lastName:'Staff',email:'staff@test.local',passwordHash:'unused',role:'STAFF'}),tokens={ADMIN:signAccessToken(admin),STAFF:signAccessToken(staff)};
 const api=async(path,body,status=200,role='ADMIN')=>{const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const json=await response.json();assert.equal(response.status,status,JSON.stringify(json));return json};
 const project=await Project.create({projectId:'PRJ-X',projectCode:'X',projectName:'Searchable Hills',createdBy:admin._id}),client=await Client.create({clientId:'CL-X',firstName:'Ana',lastName:'Buyer',createdBy:admin._id});
 await Client.insertMany(Array.from({length:26},(_,i)=>({clientId:'CL-EMPTY-'+i,firstName:'Empty',lastName:String(i),createdBy:admin._id})));
 const agents=await Agent.create([{agentId:'AGT-A',fullName:'Agent A',agentType:'Broker',createdBy:admin._id},{agentId:'AGT-B',fullName:'Agent B',agentType:'Broker',createdBy:admin._id}]);
 const property=await Property.create({propertyId:'PROP-X',project:project._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:120,status:'RESERVED',client:client._id,createdBy:admin._id});
 const a=await Account.create({assignmentId:'CTR-X',client:client._id,project:project._id,property:property._id,createdBy:admin._id,contract:{totalCents:1200000,months:12,contractDate:'2026-01-01',firstDueDate:'2026-01-05',downPaymentCents:0,schedule:buildSchedule(1200000,12,'2026-01-05')},payments:[{paymentId:'PAY-X',requestId:randomUUID(),receiptNumber:'OR-X',paymentDate:'2026-01-05',amountCents:200000,method:'CASH',createdBy:admin._id}],commissionAgreement:{percentageBps:1000,propertyBudgetCents:120000,termMonths:12,agents:agents.map(g=>({agent:String(g._id),agentId:g.agentId,percentageBps:500}))}});
 const snapshot=calculateCommissions(a.toObject(),allocatePayments(a.toObject()));await Account.updateOne({_id:a._id},{$set:{commissionSnapshot:snapshot}});const originalPayments=JSON.stringify((await Account.findById(a._id).lean()).payments);
 const agentId=String(agents[0]._id),other=String(agents[1]._id);
 let j=await api(`/commissions?agent=${agentId}&status=EARNED,UNRELEASED&clients=${client._id}`);assert.equal(j.data.total,2);assert.ok(j.data.rows.every(r=>r.agent===agentId));assert.equal(j.data.summary.earnedCents,10000);
 j=await api(`/commissions/accounts/${a._id}?agent=${agentId}`);assert.ok(j.data.snapshot.records.every(r=>r.agent===agentId));assert.ok(!JSON.stringify(j.data).includes(other));
 j=await api('/clients?q=Searchable&accountStatuses=ACTIVE,OVERDUE&limit=25');assert.equal(j.total,1);assert.equal(j.data[0].matchingAccounts[0].property.propertyId,'PROP-X');
 j=await api('/list-reports/clients');assert.equal(j.data.count,27);assert.equal(j.data.summary.totalClients,27);
 j=await api(`/list-reports/commissions?agent=${agentId}&report=DETAIL&status=EARNED,UNRELEASED&clients=${client._id}`);assert.equal(j.data.rows.length,2);assert.equal(j.data.summary.earnedCents,10000);
 j=await api('/list-reports/agents');assert.equal(j.data.summary.totalAgents,2);assert.equal(j.data.summary.earnedCents,20000);
 j=await api('/commissions/unallocated');assert.equal(j.data.total,1);assert.equal(j.data.rows[0].unallocatedCents,0);
 await CashEntry.create({entryId:'OPEN-X',requestId:randomUUID(),kind:'OPENING',effectiveDate:'2026-01-01',amountCents:0,reason:'Initial verified office cash',createdBy:admin._id});
 const base='/finance/cash-office';j=await api(base+'?from=2026-01-01&to=2026-01-06');assert.equal(j.data.summary.closingCents,200000);
 await api(base+'/reviews',{type:'TURNOVER',date:'2026-01-06',amount:500,recipient:'Owner',requestId:randomUUID(),confirm:true},403,'STAFF');
 j=await api(base+'/reviews',{type:'TURNOVER',date:'2026-01-06',amount:500,recipient:'Owner',requestId:randomUUID(),confirm:true},201);let review=j.data;
 assert.equal((await api(base+'?from=2026-01-01&to=2026-01-06')).data.summary.closingCents,200000);
 const action=async act=>{const j=await api(base+'/reviews/'+review._id+'/actions',{action:act,expectedVersion:review.__v,releaseDate:'2026-01-06',confirm:true});review=j.data;return review};
 await action('SUBMIT');await action('APPROVE');assert.equal((await api(base+'?from=2026-01-01&to=2026-01-06')).data.summary.closingCents,200000);await action('RELEASE');await action('RELEASE');assert.equal(await CashEntry.countDocuments({kind:'OWNER_TURNOVER'}),1);assert.equal((await api(base+'?from=2026-01-07&to=2026-01-07')).data.summary.openingCents,150000);
 await api(base+'/reviews',{type:'TURNOVER',date:'2026-01-07',amount:1600,recipient:'Owner',requestId:randomUUID(),confirm:true},409);
 j=await api(base+'/reviews',{type:'COUNT',date:'2026-01-07',amount:1490,requestId:randomUUID(),confirm:true},201);review=j.data;assert.equal(review.differenceCents,-1000);await action('SUBMIT');await action('APPROVE');assert.equal(await CashEntry.countDocuments(),2);
 j=await api(base+'?from=2026-01-01&to=2026-01-07&preview=1');const response=await fetch(`http://127.0.0.1:${server.address().port}/api${base}?from=2026-01-01&to=2026-01-07&format=xlsx&expectedSnapshot=${j.data.snapshot}`,{headers:{Authorization:'Bearer '+tokens.ADMIN}});assert.equal(response.status,200);const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(await response.arrayBuffer()));assert.ok(book.getWorksheet('Records').rowCount>2);
 assert.equal(JSON.stringify((await Account.findById(a._id).lean()).payments),originalPayments);assert.equal(await Review.countDocuments(),2);
 // A count cannot be approved against cash records changed since it was recorded.
 j=await api(base+'/reviews',{type:'COUNT',date:'2026-01-07',amount:1500,requestId:randomUUID(),confirm:true},201);review=j.data;await action('SUBMIT');
 await CashEntry.create({entryId:'ADD-X',requestId:randomUUID(),kind:'INFLOW',effectiveDate:'2026-01-07',amountCents:100,reason:'Verified owner contribution',createdBy:admin._id});
 await api(base+'/reviews/'+review._id+'/actions',{action:'APPROVE',expectedVersion:review.__v,confirm:true},409);
 // Successful assignment is persisted once; a repeated request cannot claim the same lot.
 const available=await Property.create({propertyId:'PROP-AVAILABLE',project:project._id,phaseNumber:1,blockNumber:1,lotNumber:2,areaSqm:100,pricePerSqm:120,status:'AVAILABLE',createdBy:admin._id});
 const assignment={propertyId:String(available._id),months:12,downPayment:0,contractDate:'2026-01-01',firstDueDate:'2026-01-05'};
 j=await api('/clients/'+client._id+'/assignments',assignment,201);assert.ok(j.data._id);await api('/clients/'+client._id+'/assignments',assignment,409);assert.equal(await Account.countDocuments({property:available._id}),1);
 const releaseEntry=await CashEntry.findOne({kind:'OWNER_TURNOVER'}).lean();
 await api('/finance/cash-ledger/'+releaseEntry._id+'/correct',{effectiveDate:'2026-01-06',amount:490,recipient:'Owner corrected',reference:'CORRECTED-REF',reason:'',correctionReason:'Corrected actual turnover amount',expectedVersion:releaseEntry.__v,confirm:true});
 j=await api(base+'/reviews?type=TURNOVER');assert.equal(j.data.rows[0].effectiveRelease.amountCents,49000);assert.equal(j.data.rows[0].effectiveRelease.recipient,'Owner corrected');
 const corrected=await CashEntry.findById(releaseEntry._id).lean();await api('/finance/cash-ledger/'+corrected._id+'/void',{expectedVersion:corrected.__v,reason:'Void test turnover with full audit',confirm:true});
 j=await api(base+'/reviews?type=TURNOVER');assert.equal(j.data.rows[0].effectiveRelease.status,'VOIDED');
 await api(base+'?from=2026-01-01&to=2026-01-07&format=xlsx&expectedSnapshot=stale',undefined,409);


 }finally{await new Promise(r=>server.close(r));await mongoose.connection.dropDatabase();await mongoose.disconnect()}
});
