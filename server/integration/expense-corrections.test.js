import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Expense from '../src/models/Expense.js';
import PropertyAssignment from '../src/models/PropertyAssignment.js';
import ActivityLog from '../src/models/ActivityLog.js';
import {signAccessToken} from '../src/utils/jwt.js';

test('expense preview/correction/void preserves history, cash/report totals, permissions, links and retry safety',{skip:!process.env.CPM_EXPENSE_TEST_URI},async()=>{
 await mongoose.connect(process.env.CPM_EXPENSE_TEST_URI,{dbName:'cpm_expense_'+randomUUID().replaceAll('-','')});process.env.JWT_SECRET||='isolated-expense-test';const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 try{
  await Expense.init();const tokens={},users={};for(const role of ['ADMIN','STAFF','VIEWER']){users[role]=await User.create({username:role.toLowerCase(),firstName:role,lastName:'Expense',email:role+'@test.local',passwordHash:'unused',role});tokens[role]=signAccessToken(users[role]);}
  const api=async(path,method='GET',body,role='ADMIN',status=200)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Authorization:'Bearer '+tokens[role],'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));return j.data;};
  await api('/finance/cash-ledger','POST',{kind:'OPENING',effectiveDate:'2026-11-01',amount:1000,reason:'Verified office opening',coverageConfirmed:true,confirm:true,requestId:randomUUID()},'ADMIN',201);
  const initial={category:'OFFICE',expenseDate:'2026-11-02',amount:100,method:'CASH',description:'Office materials',payee:'Supplier',payoutLinkChecked:true,requestId:randomUUID()};const e=await api('/finance/expenses','POST',initial,'STAFF',201),path=`/finance/expenses/${e._id}/corrections`;
  const body={action:'CORRECT',reason:'Correct transcribed amount',requestId:randomUUID(),expectedVersion:e.__v,changes:{...initial,amount:150}};
  await api(path+'/preview','POST',body,'STAFF',403);await api(path+'/preview','POST',body,'VIEWER',403);await api(path+'/preview','POST',{...body,reason:''},'ADMIN',400);await api(path+'/preview','POST',{...body,changes:{...body.changes,amount:-1}},'ADMIN',400);
  const p=await api(path+'/preview','POST',body);assert.equal(p.after.amountCents,15000);assert.equal((await Expense.findById(e._id)).amountCents,10000);await api(path,'POST',body,'ADMIN',409);
  const updated=await api(path,'POST',{...body,previewToken:p.token,confirm:true});assert.equal(updated.amountCents,15000);assert.equal(updated.originalValues.amountCents,10000);assert.equal(updated.revisions.length,1);await api(path,'POST',{...body,previewToken:p.token,confirm:true});assert.equal((await Expense.findById(e._id)).revisions.length,1);
  const reportPath='/finance/reports/collections?from=2026-11-01&to=2026-11-05';let report=await api(reportPath);assert.equal(report.totalExpensesCents,15000);assert.equal(report.cash.closingCents,85000);assert.equal((await api('/finance/reports/expenses?from=2026-11-01&to=2026-11-05')).totalCents,15000);
  const vb={action:'VOID',reason:'Duplicate expense was recorded',requestId:randomUUID(),expectedVersion:updated.__v},vp=await api(path+'/preview','POST',vb);const voided=await api(path,'POST',{...vb,confirm:true,previewToken:vp.token});assert.equal(voided.status,'VOIDED');assert.equal(voided.revisions.length,2);assert.equal(voided.originalValues.amountCents,10000);assert.equal(await Expense.countDocuments({_id:e._id}),1);await api(path,'POST',{...vb,confirm:true,previewToken:vp.token});assert.equal((await Expense.findById(e._id)).revisions.length,2);
  report=await api(reportPath);assert.equal(report.totalExpensesCents,0);assert.equal(report.cash.closingCents,100000);assert.equal((await api('/finance/expenses?paged=1&status=VOIDED&limit=10')).count,1);assert.equal((await api('/finance/expenses?paged=1&status=ALL')).postedAmountCents,0);const history=await api(`/finance/expenses/${e._id}`);assert.equal(history.revisions[1].previousValues.amountCents,15000);await api(path+'/preview','POST',{...body,expectedVersion:voided.__v,requestId:randomUUID()},'ADMIN',409);
  const other=await api('/finance/expenses','POST',{...initial,requestId:randomUUID()},'STAFF',201),otherPath=`/finance/expenses/${other._id}/corrections`,attempts=[120,130].map(amount=>({...body,requestId:randomUUID(),expectedVersion:other.__v,changes:{...initial,amount}}));const previews=await Promise.all(attempts.map(b=>api(otherPath+'/preview','POST',b)));
  const responses=await Promise.all(attempts.map((b,i)=>fetch(`http://127.0.0.1:${server.address().port}/api${otherPath}`,{method:'POST',headers:{Authorization:'Bearer '+tokens.ADMIN,'Content-Type':'application/json'},body:JSON.stringify({...b,confirm:true,previewToken:previews[i].token})})));assert.equal(responses.filter(r=>r.status===200).length,1);assert.equal(responses.filter(r=>r.status===409).length,1);assert.equal((await Expense.findById(other._id)).revisions.length,1);
  // A real stored payout remains paid when its expense mirror is voided.
  const accountId=new mongoose.Types.ObjectId();await PropertyAssignment.collection.insertOne({_id:accountId,assignmentId:'CTR-LINK',client:new mongoose.Types.ObjectId(),project:new mongoose.Types.ObjectId(),property:new mongoose.Types.ObjectId(),payments:[],commissionPayouts:[{payoutId:'CPY-LINK',commissionId:'COM-LINK',amountCents:10000,releaseDate:'2026-11-03',method:'CASH'}]});
  const linked=await api('/finance/expenses','POST',{...initial,requestId:randomUUID(),expenseDate:'2026-11-03',commissionPayoutId:'CPY-LINK'},'STAFF',201),linkedPath=`/finance/expenses/${linked._id}/corrections`;
  await api(linkedPath+'/preview','POST',{...body,requestId:randomUUID(),expectedVersion:linked.__v,changes:{...initial,amount:200,expenseDate:'2026-11-03'}},'ADMIN',400);
  const beforeLinkVoid=(await api(reportPath)).cash.closingCents,lv={action:'VOID',reason:'Remove duplicate expense mirror',requestId:randomUUID(),expectedVersion:linked.__v},lp=await api(linkedPath+'/preview','POST',lv);assert.equal(lp.warnings.length,1);await api(linkedPath,'POST',{...lv,confirm:true,previewToken:lp.token});assert.equal((await api(reportPath)).cash.closingCents,beforeLinkVoid,'payout must still be deducted exactly once');assert.equal((await PropertyAssignment.collection.findOne({_id:accountId})).commissionPayouts.length,1);
  assert.ok(await ActivityLog.exists({metadata:{$exists:true},module:'Expenses',outcome:'SUCCEEDED'}));
 }finally{await mongoose.connection.dropDatabase();await mongoose.disconnect();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
