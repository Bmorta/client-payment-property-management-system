import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {randomUUID} from "node:crypto";
import app from "../src/app.js";
import Agent from "../src/models/Agent.js";
import User from "../src/models/User.js";
import Client from "../src/models/Client.js";
import Project from "../src/models/Project.js";
import Property from "../src/models/Property.js";
import PropertyAssignment from "../src/models/PropertyAssignment.js";
import ActivityLog from "../src/models/ActivityLog.js";
import {signAccessToken} from "../src/utils/jwt.js";

test("isolated MongoDB payment corrections, permissions, notifications and persistence",{skip:!process.env.CPM_TEST_MONGO_URI},async t=>{
 t.mock.timers.enable({apis:["Date"],now:new Date("2026-11-05T04:00:00Z")});
 const dbName=`cpm_test_${randomUUID().replaceAll("-","")}`;
 await mongoose.connect(process.env.CPM_TEST_MONGO_URI,{dbName});
 const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
 const url=`http://127.0.0.1:${server.address().port}/api`,abort=new AbortController();
 try{
  process.env.JWT_SECRET ||= "isolated-integration-test-secret";
  await Promise.all([Agent.init(),User.init(),Client.init(),Project.init(),Property.init(),PropertyAssignment.init()]);
  const users={};for(const role of ["ADMIN","STAFF","VIEWER"]){const u=await User.create({username:role.toLowerCase(),firstName:role,lastName:"Test",email:`${role}@test.local`,passwordHash:"not-used",role});users[role]=signAccessToken(u)}
  const admin=await User.findOne({role:"ADMIN"});
  async function api(path,method="GET",body,role="ADMIN",status=200){if(method==="POST"&&["/finance/payments","/finance/payments/preview"].includes(path))body={...body,receiptNumber:body.receiptNumber||`OFFICE-${body.requestId}`};const r=await fetch(url+path,{method,headers:{Authorization:`Bearer ${users[role]}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data}
  await Client.create({clientId:"CLT-000090",firstName:"Legacy",lastName:"Test",createdBy:admin._id});
  const clients=await Promise.all([api("/clients","POST",{firstName:"Ana",lastName:"Morta",clientId:"IGNORED"},"ADMIN",201),api("/clients","POST",{firstName:"Bea",lastName:"Morta"},"ADMIN",201)]);
  assert.equal(new Set(clients.map(c=>c.data.clientId)).size,2);assert.ok(clients.every(c=>Number(c.data.clientId.split("-")[1])>90));
  const client=clients[0].data;await api(`/clients/${client._id}`,"PUT",{clientId:"CHANGE"},"ADMIN",400);
  const project=await Project.create({projectId:"PRJ-1",projectCode:"TEST",projectName:"Integration Project",status:"ACTIVE",createdBy:admin._id});
  const property=await Property.create({propertyId:"PROP-001",project:project._id,phaseNumber:1,blockNumber:2,lotNumber:7,areaSqm:100,pricePerSqm:1000,createdBy:admin._id});
  const assignment=(await api(`/clients/${client._id}/assignments`,"POST",{propertyId:String(property._id),months:12,downPayment:"10000",contractDate:"2026-01-01",firstDueDate:"2026-02-01"},"ADMIN",201)).data;
  const search=await api("/finance/clients/search?q=7&page=1");assert.equal(search.data[0]._id,client._id);assert.equal(search.data[0].accounts,undefined);
  const body={receiptNumber:"0004587",accountId:assignment._id,amount:"12000",paymentDate:"2026-02-01",method:"CASH",requestId:randomUUID()};
  const posted=await Promise.all([0,1].map(async()=>{const r=await fetch(url+"/finance/payments",{method:"POST",headers:{Authorization:`Bearer ${users.STAFF}`,"Content-Type":"application/json"},body:JSON.stringify(body)});assert.ok([200,201].includes(r.status));return r.json()}));
  const payment=posted[0].data;assert.equal(payment.receiptNumber,"0004587");assert.equal(posted[1].data.receiptNumber,payment.receiptNumber);
  const replay=await api("/finance/payments","POST",body,"STAFF");assert.equal(replay.data.receiptNumber,payment.receiptNumber);
  delete body.receiptNumber;
  const original=await PropertyAssignment.findById(assignment._id).lean();assert.equal(original.payments.length,1);
  await PropertyAssignment.collection.updateOne({_id:original._id},{$set:{"payments.0.externalCommissionMetadata":{agent:"legacy-agent",amountCents:1234},"contract.externalCommissionMetadata":{agent:"legacy-agent"}}});
  const correction={amount:"14000",paymentDate:"2026-02-01",method:"CASH",notes:"Corrected count",reason:"Counted cash again",type:"AUTO",baseRevision:0,requestId:randomUUID()};
  const path=`/finance/accounts/${assignment._id}/payments/${payment.paymentId}/corrections`;
  const pending=await api(path,"POST",correction,"STAFF",201);
  assert.equal((await PropertyAssignment.findById(assignment._id).lean()).payments[0].amountCents,1200000);
  const decisionPath=`/finance/accounts/${assignment._id}/requests/${pending.data.requestId}/decision`;
  await api(decisionPath,"POST",{decision:"APPROVED",confirm:true},"STAFF",403);
  const adminNotifications=await api("/finance/notifications");assert.equal(adminNotifications.data.unread,1);
  await api(decisionPath,"POST",{decision:"APPROVED",confirm:true});
  const details=(await api(`/finance/accounts/${assignment._id}`)).data;
  assert.equal(details.summary.paidCents,1400000);assert.equal(details.payments[0].amountCents,1400000);assert.equal(details.summary.partialMonths,1);assert.equal(details.summary.fullyPaidMonths,0);
  assert.equal(details.notifications,undefined);assert.equal(details.auditEvents,undefined);
  const persisted=await PropertyAssignment.findById(assignment._id).lean();assert.equal(persisted.payments[0].amountCents,1200000);assert.equal(persisted.payments[0].revisions.length,1);assert.equal(persisted.payments[0].externalCommissionMetadata.amountCents,1234);assert.equal(persisted.contract.externalCommissionMetadata.agent,"legacy-agent");
  await api(decisionPath,"POST",{decision:"APPROVED",confirm:true});assert.equal((await PropertyAssignment.findById(assignment._id)).payments[0].revisions.length,1);
  let staffNotifications=(await api("/finance/notifications","GET",undefined,"STAFF")).data;assert.equal(staffNotifications.unread,1);
  await api(`/finance/notifications/${encodeURIComponent(adminNotifications.data.rows[0].id)}/read`,"POST",{},"STAFF");assert.equal((await api("/finance/notifications")).data.unread,1);
  staffNotifications=(await api("/finance/notifications/read-all","POST",{},"STAFF")).data;assert.equal(staffNotifications.unread,0);
  const nextRequest=await api(path,"POST",{...correction,baseRevision:1,requestId:randomUUID(),amount:"15000"},"STAFF",201);
  await api(path,"POST",{...correction,baseRevision:1,requestId:randomUUID(),amount:"16000",confirm:true});
  assert.equal((await api("/finance/approval-requests")).data.find(r=>r.requestId===nextRequest.data.requestId).status,"STALE");
  const rejectRequest=await api(path,"POST",{...correction,baseRevision:2,requestId:randomUUID(),amount:"17000"},"STAFF",201);
  await api(`/finance/accounts/${assignment._id}/requests/${rejectRequest.data.requestId}/decision`,"POST",{decision:"REJECTED",reason:"Original receipt was correct",confirm:true});
  assert.equal((await api(`/finance/accounts/${assignment._id}`)).data.summary.paidCents,1600000);
  await api(path,"POST",{...correction,baseRevision:2,requestId:randomUUID(),confirm:true,voided:true});
  assert.equal((await api(`/finance/accounts/${assignment._id}`)).data.summary.paidCents,0);
  const dp=await api("/finance/payments","POST",{...body,requestId:randomUUID(),amount:"10000",type:"DOWN_PAYMENT"},"STAFF",201);
  assert.notEqual(dp.data.receiptNumber,payment.receiptNumber);
  await api("/finance/payments","POST",{...body,requestId:randomUUID(),amount:"7500",type:"INSTALLMENT"},"STAFF",201);
  assert.equal((await api(`/finance/accounts/${assignment._id}`)).data.summary.fullyPaidMonths,1);
  await api(path,"POST",{...correction,baseRevision:3,requestId:randomUUID(),confirm:true},"VIEWER",403);
  await api("/finance/approval-requests","GET",undefined,"VIEWER",403);
  const monitorTerms={dueDay:5,graceDays:5,penaltyPercentage:3,frequency:"MONTHLY",penaltyStatus:"ACTIVE",penaltyBasis:"FULL_INSTALLMENT",allocationPriority:"PRINCIPAL_FIRST",effectiveDate:"2026-11-01",forfeitureMonths:3,criticalMonths:2,reminderDays:5};
  const advanceLot=await Property.create({propertyId:"PROP-ADVANCE",project:project._id,phaseNumber:2,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:2160,createdBy:admin._id});
  const advanceAccount=(await api(`/clients/${clients[1].data._id}/assignments`,"POST",{propertyId:String(advanceLot._id),months:36,monthlyInstallment:"6000",downPayment:"0",contractDate:"2026-11-01",firstDueDate:"2026-11-05",monitoringTerms:monitorTerms},"ADMIN",201)).data;
  const advanceBody={...body,accountId:advanceAccount._id,amount:"18000",paymentDate:"2026-11-05",type:"INSTALLMENT",requestId:randomUUID()};
  await api("/finance/payments","POST",advanceBody,"STAFF",409);
  const allocation=(await api("/finance/payments/preview","POST",advanceBody,"STAFF")).data;assert.equal(allocation.allocations.length,3);assert.equal(allocation.advanceMonths,2);assert.equal(allocation.nextUnpaidDueDate,"2027-02-05");
  const advancePosted=(await api("/finance/payments","POST",{...advanceBody,previewToken:allocation.token},"STAFF",201)).data;assert.equal(advancePosted.allocations.length,3);
  const savedAdvance=await PropertyAssignment.findById(advanceAccount._id).lean();assert.equal(savedAdvance.payments[0].allocations.length,3);assert.ok(savedAdvance.allocationVersions.at(-1).allocations[advancePosted.paymentId]);
  const forecast=(await api("/finance/monitoring?asOf=2027-01-20")).data.rows.find(r=>r.accountId===advanceAccount._id);assert.equal(forecast.summary.consecutiveUnpaidMonths,0);assert.equal(forecast.summary.outstandingPenaltyCents,0);assert.equal(forecast.summary.nextUnpaidDueDate,"2027-02-05");
  await api(`/finance/accounts/${advanceAccount._id}/monitoring/refresh`,"POST",{});const firstReconcile=await PropertyAssignment.findById(advanceAccount._id).lean();await api(`/finance/accounts/${advanceAccount._id}/monitoring/refresh`,"POST",{});const secondReconcile=await PropertyAssignment.findById(advanceAccount._id).lean();assert.equal(secondReconcile.allocationVersions.length,firstReconcile.allocationVersions.length);assert.equal(secondReconcile.notifications.length,firstReconcile.notifications.length);
  const correctionPath=`/finance/accounts/${advanceAccount._id}/payments/${advancePosted.paymentId}/corrections`,advanceCorrection={...correction,amount:"15000",paymentDate:"2026-11-05",requestId:randomUUID()};
  const correctionPreview=(await api(correctionPath+"/preview","POST",advanceCorrection,"STAFF")).data;
  const advanceRequest=await api(correctionPath,"POST",{...advanceCorrection,previewToken:correctionPreview.token},"STAFF",201);await api(`/finance/accounts/${advanceAccount._id}/requests/${advanceRequest.data.requestId}/decision`,"POST",{decision:"APPROVED",confirm:true});
  const correctedAdvance=(await api(`/finance/accounts/${advanceAccount._id}`)).data;assert.equal(correctedAdvance.summary.fullyPaidMonths,2);assert.equal(correctedAdvance.summary.partialMonths,1);assert.equal(correctedAdvance.payments[0].revisions[0].previousAllocations.length,3);
  await PropertyAssignment.collection.updateOne({_id:savedAdvance._id},{$set:{"contract.externalCommissionMetadata":{agent:"contract-agent",retained:true}}});
  await api(`/finance/accounts/${advanceAccount._id}/agreement`,"PATCH",{months:36,downPayment:"0",monthlyInstallment:"6000",firstDueDate:"2026-11-05",monitoringTerms:{...monitorTerms,penaltyPercentage:4},expectedVersion:correctedAdvance.__v,confirmScheduleReplacement:true,reason:"Amended signed contractual rate"});
  assert.equal((await PropertyAssignment.findById(advanceAccount._id).lean()).contract.externalCommissionMetadata.retained,true);
  const penaltyLot=await Property.create({propertyId:"PROP-PENALTY",project:project._id,phaseNumber:3,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:180,createdBy:admin._id});
  const penaltyAccount=(await api(`/clients/${clients[1].data._id}/assignments`,"POST",{propertyId:String(penaltyLot._id),months:3,monthlyInstallment:"6000",downPayment:"0",contractDate:"2026-08-01",firstDueDate:"2026-08-05",monitoringTerms:{...monitorTerms,effectiveDate:"2026-08-01"}},"ADMIN",201)).data;
  let penaltyDetails=(await api(`/finance/accounts/${penaltyAccount._id}`)).data;assert.equal(penaltyDetails.summary.outstandingPenaltyCents,108000);assert.equal(penaltyDetails.summary.riskStatus,"FORFEITURE_REVIEW_REQUIRED");assert.equal(penaltyDetails.penaltyLedger.length,6);
  const waiveBody={assessmentId:penaltyDetails.summary.assessments[0].assessmentId,amount:"180",reason:"Approved contractual waiver",expectedVersion:penaltyDetails.__v,confirm:true,requestId:randomUUID()};
  await api(`/finance/accounts/${penaltyAccount._id}/penalties/waive`,"POST",waiveBody,"STAFF",403);await api(`/finance/accounts/${penaltyAccount._id}/penalties/waive`,"POST",waiveBody);penaltyDetails=(await api(`/finance/accounts/${penaltyAccount._id}`)).data;await api(`/finance/accounts/${penaltyAccount._id}/penalties/waive`,"POST",waiveBody);assert.equal(penaltyDetails.summary.outstandingPenaltyCents,90000);assert.equal(penaltyDetails.penaltyWaivers.length,1);assert.equal(penaltyDetails.penaltyLedger.length,7);
  await api(`/finance/accounts/${penaltyAccount._id}/forfeiture-review`,"POST",{requestId:randomUUID(),status:"FORFEITED",noticeReference:"Test notice",legalReviewConfirmed:true,reason:"Reviewed contractual threshold",expectedVersion:penaltyDetails.__v,confirm:true},"ADMIN",409);
  await api(`/finance/accounts/${penaltyAccount._id}/forfeiture-review`,"POST",{requestId:randomUUID(),status:"UNDER_REVIEW",reason:"Review actual allocations",expectedVersion:penaltyDetails.__v,confirm:true});const protectedLot=await Property.findById(penaltyLot._id);assert.equal(protectedLot.status,"RESERVED");assert.ok(protectedLot.client);
  const monitorReport=(await api("/finance/reports?from=2026-01-01&to=2026-11-05")).data.monitoringReports;assert.ok(monitorReport.penalties.length>=6);assert.ok(monitorReport.advance.some(r=>r.accountId===advanceAccount._id));
  const xlsx=await fetch(url+"/finance/reports/monitoring.xlsx?from=2026-01-01&to=2026-11-05",{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(xlsx.status,200);assert.equal(Buffer.from(await xlsx.arrayBuffer()).subarray(0,2).toString(),"PK");
  const project2=await Project.create({projectId:"PRJ-COM2",projectCode:"COM2",projectName:"Second Commission Project",status:"ACTIVE",createdBy:admin._id});
  await Agent.create({agentId:"AGT-000010",fullName:"Existing Agent",agentType:"Broker",createdBy:admin._id});
  const agentForm={fullName:"Agent A",agentType:"Sales Agent",status:"ACTIVE",assignedProjects:[String(project._id),String(project2._id)],contactNumber:"123",reason:"Create agent profile"};
  await api("/agents","POST",agentForm,"STAFF",403);
  const agentsCreated=await Promise.all([api("/agents","POST",agentForm,"ADMIN",201),api("/agents","POST",{...agentForm,fullName:"Agent B",assignedProjects:[]},"ADMIN",201)]),agentA=agentsCreated[0].data,agentB=agentsCreated[1].data;
  assert.notEqual(agentA.agentId,agentB.agentId);assert.ok(Number(agentA.agentId.split("-")[1])>10);
  await api(`/agents/${agentA._id}`,"PUT",{...agentForm,agentId:"AGT-999999",expectedVersion:agentA.__v},"ADMIN",400);
  let commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;
  const agreementBody={percentage:"10",termMonths:12,agents:[{agent:agentA._id,percentage:"6"},{agent:agentB._id,percentage:"4"}],expectedVersion:commissionDetails.__v,confirm:true,reason:"Signed project commission split"};
  await api(`/commissions/accounts/${assignment._id}/agreement`,"PUT",{...agreementBody,agents:[{agent:agentA._id,percentage:"6"},{agent:agentB._id,percentage:"5"}]},"ADMIN",400);
  await api(`/commissions/accounts/${assignment._id}/agreement`,"PUT",agreementBody,"STAFF",403);
  await api(`/commissions/accounts/${assignment._id}/agreement`,"PUT",agreementBody);
  let ledgerData=(await api(`/commissions?agent=${agentA._id}&project=${project._id}&type=DP&status=UNRELEASED`)).data;
  assert.equal(ledgerData.total,1);assert.equal(ledgerData.rows[0].earnedCents,60000);assert.equal(ledgerData.summary.propertyBudgetCents,1000000);
  const dpCommission=ledgerData.rows[0];commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;
  let payoutBody={commissionId:dpCommission.commissionId,amount:"200",releaseDate:"2026-11-04",method:"CASH",reference:"Agent cash payout",notes:"Partial release",reason:"Actual partial agent payout",requestId:randomUUID(),expectedVersion:commissionDetails.__v,confirm:true};
  await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",payoutBody,"STAFF",403);
  await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",{...payoutBody,releaseDate:"2026-01-01"},"ADMIN",400);
  const partialPayout=(await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",payoutBody,"ADMIN",201)).data;
  await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",payoutBody);commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;
  assert.equal(commissionDetails.payouts.length,1);assert.equal(commissionDetails.snapshot.records.find(r=>r.commissionId===dpCommission.commissionId).status,"PARTIALLY_RELEASED");
  payoutBody={...payoutBody,amount:"400",releaseDate:"2026-11-05",requestId:randomUUID(),expectedVersion:commissionDetails.__v};await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",payoutBody,"ADMIN",201);
  ledgerData=(await api(`/commissions?agent=${agentA._id}&type=DP&status=RELEASED`)).data;assert.equal(ledgerData.total,1);assert.equal(ledgerData.rows[0].latestReleaseDate,"2026-11-05");assert.equal(ledgerData.rows[0].unreleasedCents,0);
  const unpaidRows=(await api(`/commissions?agent=${agentA._id}&status=AWAITING_BUYER_PAYMENT`)).data;assert.ok(unpaidRows.rows.length>0);assert.ok(unpaidRows.rows.every(r=>r.earnedCents===0));
  commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",{...payoutBody,amount:"1",requestId:randomUUID(),expectedVersion:commissionDetails.__v},"ADMIN",409);
  const profileB=(await api(`/agents/${agentB._id}`)).data;assert.equal(profileB.projects[0]._id,String(project._id));assert.ok((await api(`/agents?project=${project._id}`)).data.some(a=>a._id===agentB._id));
  const secondLot=await Property.create({propertyId:"PROP-COM2",project:project2._id,phaseNumber:1,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:120,createdBy:admin._id});
  const secondSale=(await api(`/clients/${clients[1].data._id}/assignments`,"POST",{propertyId:String(secondLot._id),months:12,downPayment:"0",contractDate:"2026-11-01",firstDueDate:"2026-11-05"},"ADMIN",201)).data;
  let secondDetails=(await api(`/commissions/accounts/${secondSale._id}`)).data;await api(`/commissions/accounts/${secondSale._id}/agreement`,"PUT",{percentage:"2",termMonths:12,agents:[{agent:agentA._id,percentage:"2"}],expectedVersion:secondDetails.__v,confirm:true,reason:"Different project commission"});
  await api("/finance/payments","POST",{accountId:secondSale._id,amount:"1000",paymentDate:"2026-11-05",method:"CASH",type:"INSTALLMENT",requestId:randomUUID()},"STAFF",201);
  const project2Ledger=(await api(`/commissions?agent=${agentA._id}&project=${project2._id}&status=UNRELEASED`)).data;assert.equal(project2Ledger.total,1);assert.equal(project2Ledger.rows[0].percentageBps,200);assert.equal(project2Ledger.rows[0].earnedCents,2000);
  const project1Ledger=(await api(`/commissions?agent=${agentA._id}&project=${project._id}`)).data;assert.ok(project1Ledger.rows.every(r=>r.percentageBps===600));
  const dpVoid={...correction,amount:"10000",paymentDate:"2026-02-01",type:"DOWN_PAYMENT",baseRevision:0,requestId:randomUUID(),voided:true,confirm:true};
  await api(`/finance/accounts/${assignment._id}/payments/${dp.data.paymentId}/corrections`,"POST",dpVoid);
  commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;let recoveryRow=commissionDetails.snapshot.records.find(r=>r.commissionId===dpCommission.commissionId);assert.equal(recoveryRow.recoveryDueCents,60000);assert.equal(recoveryRow.releasedCents,60000);assert.equal(commissionDetails.payouts.length,2);
  const monthlyRow=commissionDetails.snapshot.records.find(r=>r.agent===agentA._id&&r.type==="MONTHLY"&&r.earnedCents>0);assert.ok(monthlyRow);
  await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",{...payoutBody,commissionId:monthlyRow.commissionId,amount:"100",requestId:randomUUID(),expectedVersion:commissionDetails.__v},"ADMIN",409);
  let recoveryBody={commissionId:dpCommission.commissionId,amount:"200",recoveryDate:"2026-11-05",method:"CASH",reason:"Agent returned excess commission",requestId:randomUUID(),expectedVersion:commissionDetails.__v,confirm:true};
  await api(`/commissions/accounts/${assignment._id}/recoveries`,"POST",recoveryBody);await api(`/commissions/accounts/${assignment._id}/recoveries`,"POST",recoveryBody);commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;assert.equal(commissionDetails.recoveries.length,1);
  await api(`/commissions/accounts/${assignment._id}/recoveries`,"POST",{...recoveryBody,amount:"400",requestId:randomUUID(),expectedVersion:commissionDetails.__v});commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;
  const monthlyPayout=(await api(`/commissions/accounts/${assignment._id}/payouts`,"POST",{...payoutBody,commissionId:monthlyRow.commissionId,amount:"100",requestId:randomUUID(),expectedVersion:commissionDetails.__v},"ADMIN",201)).data;
  commissionDetails=(await api(`/commissions/accounts/${assignment._id}`)).data;await api(`/commissions/accounts/${assignment._id}/payouts/${monthlyPayout.payoutId}`,"PATCH",{amount:"80",releaseDate:"2026-11-05",method:"CASH",reference:"Corrected cash receipt",reason:"Agent actual cash correction",expectedVersion:commissionDetails.__v,baseRevision:0,confirm:true});
  const payoutRaw=(await PropertyAssignment.findById(assignment._id).lean()).commissionPayouts.find(p=>p.payoutId===monthlyPayout.payoutId);assert.equal(payoutRaw.amountCents,10000);assert.equal(payoutRaw.revisions[0].values.amountCents,8000);
  secondDetails=(await api(`/commissions/accounts/${secondSale._id}`)).data;const secondRecord=secondDetails.snapshot.records.find(r=>r.earnedCents>0);
  const simultaneous=await Promise.all([0,1].map(async()=>{const r=await fetch(url+`/commissions/accounts/${secondSale._id}/payouts`,{method:"POST",headers:{Authorization:`Bearer ${users.ADMIN}`,"Content-Type":"application/json"},body:JSON.stringify({commissionId:secondRecord.commissionId,amount:"20",releaseDate:"2026-11-05",method:"CASH",reason:"Concurrent release safety test",requestId:randomUUID(),expectedVersion:secondDetails.__v,confirm:true})});assert.ok([201,409].includes(r.status));return r.status}));assert.equal(simultaneous.filter(s=>s===201).length,1);assert.equal((await PropertyAssignment.findById(secondSale._id)).commissionPayouts.length,1);
  await api(`/agents/${agentA._id}`,"PUT",{...agentForm,fullName:"Agent A Updated",status:"INACTIVE",expectedVersion:agentA.__v,reason:"Archive agent without deleting history"});assert.equal((await api(`/agents/${agentA._id}`)).data.agent.status,"INACTIVE");assert.ok((await api(`/commissions?agent=${agentA._id}&status=UNRELEASED`)).data.total>0);
  const pdf=await fetch(url+`/commissions/export?agent=${agentA._id}&report=DETAIL&format=pdf`,{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),"%PDF-");
  const commissionExcel=await fetch(url+`/commissions/export?agent=${agentA._id}&report=PAYOUTS&format=xlsx`,{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(commissionExcel.status,200);assert.equal(Buffer.from(await commissionExcel.arrayBuffer()).subarray(0,2).toString(),"PK");
  assert.ok((await api("/finance/notifications")).data.rows.some(n=>n.commissionAlert));assert.ok(await ActivityLog.exists({module:"Commissions",outcome:"SUCCEEDED"}));
  const stream=await fetch(url+"/finance/notifications/stream",{headers:{Authorization:`Bearer ${users.ADMIN}`},signal:abort.signal});assert.equal(stream.status,200);const reader=stream.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/data:/);
  const streamPayment=(await PropertyAssignment.findById(assignment._id).lean()).payments.find(p=>p.type==="INSTALLMENT");
  await api(`/finance/accounts/${assignment._id}/payments/${streamPayment.paymentId}/corrections`,"POST",{...correction,amount:"7400",type:"INSTALLMENT",baseRevision:streamPayment.revisions?.length||0,requestId:randomUUID()},"STAFF",201);
  const changed=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error("SSE update timed out")),6000))]);assert.match(new TextDecoder().decode(changed.value),/data:/);abort.abort();
  assert.ok(await ActivityLog.exists({module:"Payment Corrections",outcome:"SUCCEEDED"}));

  // New office-update acceptance: generated projects, manual receipts, scoped
  // uniqueness under contention, receipt approval history and expense exports.
  const generatedProjects=await Promise.all([1,2].map(i=>api('/projects','POST',{projectName:`Generated ${i}`,projectCode:`AUTO${i}`,status:'ACTIVE'},'ADMIN',201)));
  assert.match(generatedProjects[0].data.projectId,/^PRJ-\d{6}$/);assert.notEqual(generatedProjects[0].data.projectId,generatedProjects[1].data.projectId);
  await api(`/projects/${generatedProjects[0].data._id}`,'PUT',{projectId:'MANUAL-CHANGE'},'ADMIN',400);
  const receiptLot=await Property.create({propertyId:'PROP-RECEIPT',project:project._id,phaseNumber:8,blockNumber:1,lotNumber:1,areaSqm:100,pricePerSqm:1000,createdBy:admin._id});
  const receiptSale=(await api(`/clients/${client._id}/assignments`,'POST',{propertyId:String(receiptLot._id),months:12,contractDate:'2026-01-01',firstDueDate:'2026-02-01'},'ADMIN',201)).data;
  const manualBase={accountId:receiptSale._id,amount:'100',paymentDate:'2026-11-05',method:'CASH',receiptNumber:'OR-000007/A'};
  const concurrentReceipt=await Promise.all([0,1].map(async()=>{const r=await fetch(url+'/finance/payments',{method:'POST',headers:{Authorization:`Bearer ${users.STAFF}`,'Content-Type':'application/json'},body:JSON.stringify({...manualBase,requestId:randomUUID()})});return {status:r.status,body:await r.json()}}));assert.equal(concurrentReceipt.filter(r=>r.status===201).length,1);assert.equal(concurrentReceipt.filter(r=>r.status===409).length,1);
  const manual=concurrentReceipt.find(r=>r.status===201).body.data;assert.equal(manual.receiptNumber,'OR-000007/A');
  const missing=await fetch(url+'/finance/payments',{method:'POST',headers:{Authorization:`Bearer ${users.STAFF}`,'Content-Type':'application/json'},body:JSON.stringify({...manualBase,receiptNumber:'',requestId:randomUUID()})});assert.equal(missing.status,400);
  await api('/finance/payments','POST',{...manualBase,accountId:secondSale._id,requestId:randomUUID()},'STAFF',409);
  const receiptCorrection={amount:'100',paymentDate:'2026-11-05',method:'CASH',type:'AUTO',receiptNumber:'0000009-B',reason:'Correct issued receipt number',baseRevision:0,requestId:randomUUID()};
  const receiptPath=`/finance/accounts/${receiptSale._id}/payments/${manual.paymentId}/corrections`;
  const correctionRequest=(await api(receiptPath,'POST',receiptCorrection,'STAFF',201)).data;assert.match(correctionRequest.requestNumber,/^REQ-\d{6}$/);
  assert.equal((await PropertyAssignment.findById(receiptSale._id)).payments[0].receiptNumber,'OR-000007/A');
  await api(`/finance/accounts/${receiptSale._id}/requests/${correctionRequest.requestId}/decision`,'POST',{decision:'APPROVED',confirm:true,reason:'Checked physical receipt'});
  const correctedReceipt=(await api(`/finance/accounts/${receiptSale._id}`)).data.payments[0];assert.equal(correctedReceipt.receiptNumber,'0000009-B');assert.equal(correctedReceipt.revisions[0].previousValues.receiptNumber,'OR-000007/A');
  await api('/finance/payments','POST',{...manualBase,receiptNumber:'OR-000007/A',requestId:randomUUID()},'STAFF',409);
  await api('/finance/expenses','POST',{method:'CASH',category:'PROJECT',projectId:String(project._id),expenseDate:'2026-11-05',amount:'100.25',description:'Office export acceptance',requestId:randomUUID()},'STAFF',201);
  const expenseData=(await api(`/finance/reports/expenses?from=2026-11-01&to=2026-11-05&project=${project._id}&q=Office%20export`)).data;assert.equal(expenseData.totalCents,10025);assert.equal(expenseData.count,1);assert.equal(expenseData.rows[0].createdBy.username,"staff");
  for(const format of ['xlsx','pdf']){const result=await fetch(url+`/finance/reports/expenses?from=2026-11-01&to=2026-11-05&project=${project._id}&q=Office%20export&format=${format}`,{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(result.status,200);const bytes=Buffer.from(await result.arrayBuffer());assert.equal(bytes.subarray(0,format==='pdf'?5:2).toString(),format==='pdf'?'%PDF-':'PK');if(format==='xlsx'){const {default:ExcelJS}=await import('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert.equal(book.getWorksheet('Expenses').getCell('F5').value,100.25);assert.equal(book.getWorksheet('Expenses').getCell('F6').value,100.25)}}
  const sequence=(await api(`/commissions?agent=${agentA._id}&project=${project._id}`)).data.rows;for(let i=1;i<sequence.length;i++)if(sequence[i].accountId===sequence[i-1].accountId)assert.ok(sequence[i].period>=sequence[i-1].period);


  // Collection/cash report acceptance uses an isolated day so prior scenarios
  // cannot serve as invented opening cash or hidden expense classifications.
  const cashDay='2026-11-04',cashPaymentBase={accountId:receiptSale._id,paymentDate:cashDay,type:'INSTALLMENT'};
  for(const [method,amount] of [['CASH','1000'],['GCASH','500'],['MAYA','200'],['BANK_TRANSFER','300']])await api('/finance/payments','POST',{...cashPaymentBase,method,amount,receiptNumber:`CASH-REPORT-${method}`,requestId:randomUUID()},'STAFF',201);
  await api('/finance/expenses','POST',{category:'OFFICE',expenseDate:cashDay,amount:'100',description:'Cash summary expense',requestId:randomUUID()},'STAFF',400);
  for(const [method,amount] of [['CASH','100'],['GCASH','50']])await api('/finance/expenses','POST',{method,category:'OFFICE',expenseDate:cashDay,amount,description:`Cash report expense ${method}`,payoutLinkChecked:true,requestId:randomUUID()},'STAFF',201);
  const cashBody={kind:'OPENING',amount:'1000',effectiveDate:cashDay,reason:'Authorized physical cash count',coverageConfirmed:true,confirm:true,requestId:randomUUID()};
  await api('/finance/cash-ledger','POST',cashBody,'STAFF',403);const openingCash=(await api('/finance/cash-ledger','POST',cashBody,'ADMIN',201)).data;assert.match(openingCash.entryId,/^CSH-\d{6}$/);await api('/finance/cash-ledger','POST',cashBody);
  await api('/finance/cash-ledger','POST',{...cashBody,requestId:randomUUID()},'ADMIN',409);
  const depositCash=(await api('/finance/cash-ledger','POST',{...cashBody,kind:'BANK_DEPOSIT',amount:'200',reason:'Office cash deposited to bank',requestId:randomUUID()},'ADMIN',201)).data;
  const cashQuery=`from=${cashDay}&to=${cashDay}&methods=GCASH,MAYA`;
  // Earlier commission scenario includes an actual PHP 200 cash payout on this day.
  const summaryCash=(await api(`/finance/reports/collections?${cashQuery}`)).data;
  assert.match(summaryCash.snapshot,/^[a-f0-9]{64}$/);assert.equal(summaryCash.totalCollectionsCents,70000);assert.equal(summaryCash.totalExpensesCents,5000);assert.equal(summaryCash.netCollectionCents,65000);assert.equal(summaryCash.cash.available,true);assert.equal(summaryCash.cash.openingCents,100000);assert.equal(summaryCash.cash.closingCents,150000);assert.equal(summaryCash.cash.collectionsCents,100000);assert.equal(summaryCash.cash.expensesCents,10000);assert.equal(summaryCash.expenses.count,1);
  const allCash=(await api(`/finance/reports/collections?from=${cashDay}&to=${cashDay}`)).data;assert.equal(allCash.totalCollectionsCents,200000);assert.equal(allCash.totalExpensesCents,15000);assert.equal(allCash.cash.closingCents,summaryCash.cash.closingCents);
  const {default:ExcelJS}=await import('exceljs');
  for(const format of ['xlsx','pdf']){const r=await fetch(url+`/finance/reports/collections?${cashQuery}&format=${format}&expectedSnapshot=${summaryCash.snapshot}`,{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());if(format==='xlsx'){const book=new ExcelJS.Workbook();await book.xlsx.load(bytes);assert.equal(book.getWorksheet('Summary').getCell('B8').value,700);assert.equal(book.getWorksheet('Summary').getCell('B9').value,50);assert.equal(book.getWorksheet('Summary').getCell('B18').value,1500);assert.equal(book.getWorksheet('Collections').rowCount,9)}else assert.equal(bytes.subarray(0,5).toString(),'%PDF-')}
  for(let n=0;n<22;n++)await api('/finance/payments','POST',{...cashPaymentBase,paymentDate:'2026-11-03',method:'CASH',amount:'1',receiptNumber:`PAGED-CASH-${n}`,requestId:randomUUID()},'STAFF',201);
  const pagedCash=(await api('/finance/payments?paged=1&from=2026-11-03&to=2026-11-03&methods=CASH,GCASH&page=2')).data;assert.equal(pagedCash.count,22);assert.equal(pagedCash.rows.length,2);assert.equal(pagedCash.totalCents,2200);
  const fullCash=(await api('/finance/payments?paged=1&all=1&from=2026-11-03&to=2026-11-03&methods=CASH,GCASH&page=2')).data;assert.equal(fullCash.rows.length,22);assert.equal(fullCash.totalCents,pagedCash.totalCents);
  const legacyExpenseId=new mongoose.Types.ObjectId();await (await import('../src/models/Expense.js')).default.collection.insertOne({_id:legacyExpenseId,expenseId:'EXP-LEGACY-CASH',requestId:randomUUID(),expenseDate:cashDay,category:'OFFICE',description:'Legacy unclassified cash cost',amountCents:2500,createdBy:admin._id,__v:0});
  await api(`/finance/reports/collections?${cashQuery}&expectedSnapshot=${summaryCash.snapshot}&all=1`,'GET',undefined,'ADMIN',409);
  const unknownCash=(await api(`/finance/reports/collections?${cashQuery}`)).data;assert.equal(unknownCash.cash.available,false);assert.equal(unknownCash.cash.closingCents,null);assert.equal(unknownCash.totalExpensesCents,5000);
  const classifyCash={method:'CASH',payoutLinkChecked:true,expectedVersion:0,reason:'Verified original funding record',confirm:true};await api(`/finance/expenses/${legacyExpenseId}/classification`,'PATCH',classifyCash,'STAFF',403);await api(`/finance/expenses/${legacyExpenseId}/classification`,'PATCH',classifyCash);
  const classifiedCash=(await api(`/finance/reports/collections?${cashQuery}`)).data;assert.equal(classifiedCash.cash.available,true);assert.equal(classifiedCash.cash.closingCents,147500);
  const beforeLinkedCash=(await api('/finance/reports/collections?from=2026-11-05&to=2026-11-05')).data;
  const linkedExpenseBody={method:'CASH',category:'PROJECT',projectId:String(project._id),expenseDate:'2026-11-05',amount:'80',description:'Commission already paid through payout',commissionPayoutId:monthlyPayout.payoutId,requestId:randomUUID()};
  await api('/finance/expenses','POST',linkedExpenseBody,'STAFF',201);const afterLinkedCash=(await api('/finance/reports/collections?from=2026-11-05&to=2026-11-05')).data;assert.equal(beforeLinkedCash.cash.available,true);assert.equal(afterLinkedCash.cash.available,true);assert.equal(afterLinkedCash.cash.closingCents,beforeLinkedCash.cash.closingCents);assert.equal(afterLinkedCash.totalExpensesCents,beforeLinkedCash.totalExpensesCents+8000);
  await api('/finance/expenses','POST',{...linkedExpenseBody,requestId:randomUUID()},'STAFF',409);
  await api(`/finance/cash-ledger/${depositCash._id}/void`,'POST',{expectedVersion:0,reason:'Deposit was entered in error',confirm:true});const afterVoidCash=(await api(`/finance/reports/collections?${cashQuery}`)).data;assert.equal(afterVoidCash.cash.closingCents,167500);
  assert.ok(await ActivityLog.exists({'metadata.details.action':'CASH_ENTRY_RECORDED',outcome:'SUCCEEDED'}));assert.ok(await ActivityLog.exists({'metadata.details.action':'EXPENSE_CLASSIFIED',outcome:'SUCCEEDED'}));

  const otherBase={...cashPaymentBase,method:'OTHER',amount:'20',receiptNumber:'OTHER-FUNDING-001',requestId:randomUUID()};
  await api('/finance/payments','POST',otherBase,'STAFF',400);await api('/finance/payments','POST',{...otherBase,fundingAccount:'NONCASH'},'STAFF',201);
  const beforeOtherCash=(await api(`/finance/reports/collections?${cashQuery}`)).data;assert.equal(beforeOtherCash.cash.available,true);assert.equal(beforeOtherCash.cash.closingCents,167500);
  await api('/finance/payments','POST',{...otherBase,amount:'5',receiptNumber:'OTHER-FUNDING-002',fundingAccount:'CASH',requestId:randomUUID()},'STAFF',201);
  const afterOtherCash=(await api(`/finance/reports/collections?${cashQuery}`)).data;assert.equal(afterOtherCash.totalCollectionsCents,70000);assert.equal(afterOtherCash.cash.closingCents,168000);
  const allOther=(await api(`/finance/reports/collections?from=${cashDay}&to=${cashDay}`)).data;assert.equal(allOther.breakdown.find(b=>b.method==='OTHER').collectionsCents,2500);
  await api('/finance/expenses','POST',{category:'OTHER',method:'OTHER',fundingAccount:'NONCASH',expenseDate:cashDay,amount:'10',description:'Other noncash funding confirmed',requestId:randomUUID()},'STAFF',201);
  assert.equal((await api(`/finance/reports/collections?${cashQuery}`)).data.cash.closingCents,168000);

  // Preview-first list reports retain existing permissions and include every matching page.
  await Agent.insertMany(Array.from({length:25},(_,i)=>({agentId:`AGT-PREVIEW-${i}`,fullName:`Preview Agent ${String(i).padStart(2,'0')}`,agentType:'TEST',status:'ACTIVE',createdBy:admin._id})));
  await ActivityLog.insertMany(Array.from({length:25},(_,i)=>({action:'UPDATED',module:'Settings',description:`Preview Audit ${i}`,username:'admin',userRole:'ADMIN',userId:admin._id,updatedValues:{passwordHash:'NEVER_EXPORT_AUDIT',visible:'yes'}})));
  for(const module of ['users','activity-logs'])for(const role of ['STAFF','VIEWER'])await api(`/list-reports/${module}`,'GET',undefined,role,403);
  const reportQueries={inventory:`project=${project._id}&phase=1`,projects:'',clients:'',users:'',agents:'q=Preview%20Agent','activity-logs':'q=Preview%20Audit',commissions:'report=DETAIL'};
  for(const [module,query] of Object.entries(reportQueries)){
   const preview=(await api(`/list-reports/${module}?${query}`)).data;assert.ok(preview.snapshot);assert.equal(preview.count,preview.rows.length);assert.ok(!JSON.stringify(preview).includes('NEVER_EXPORT_AUDIT'));assert.ok(!JSON.stringify(preview).includes('not-used'));
   if(['agents','activity-logs'].includes(module))assert.equal(preview.count,25);
   for(const format of ['csv','xlsx']){const exported=await fetch(url+`/list-reports/${module}?${query}&format=${format}&expectedSnapshot=${preview.snapshot}`,{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(exported.status,200);const bytes=Buffer.from(await exported.arrayBuffer());if(format==='xlsx'){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);assert.equal(workbook.worksheets[0].getCell('B5').value,preview.count)}else assert.ok(bytes.toString().includes(preview.title))}
  }
  const inventoryPreview=(await api(`/list-reports/inventory?project=${project._id}`)).data;assert.ok(inventoryPreview.title.includes(project.projectName));
  await Property.updateOne({_id:property._id},{$set:{pricePerSqm:4321}});await api(`/list-reports/inventory?project=${project._id}&format=xlsx&expectedSnapshot=${inventoryPreview.snapshot}`,'GET',undefined,'ADMIN',409);await Property.updateOne({_id:property._id},{$set:{pricePerSqm:property.pricePerSqm}});
  const projectPreview=(await api('/list-reports/projects')).data;await Project.updateOne({_id:project._id},{$set:{projectName:'Changed after preview'}});await api(`/list-reports/projects?format=csv&expectedSnapshot=${projectPreview.snapshot}`,'GET',undefined,'ADMIN',409);await Project.updateOne({_id:project._id},{$set:{projectName:project.projectName}});
  await api('/list-reports/projects?format=xlsx','GET',undefined,'ADMIN',400);
  const commissionPreview=(await api('/list-reports/commissions?report=PAYOUTS')).data;const previewPdf=await fetch(url+`/list-reports/commissions?report=PAYOUTS&format=pdf&expectedSnapshot=${commissionPreview.snapshot}`,{headers:{Authorization:`Bearer ${users.ADMIN}`}});assert.equal(previewPdf.status,200);assert.equal(Buffer.from(await previewPdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-');

  // Exercise the migration only against this disposable test database.
  const missingProjectId=new mongoose.Types.ObjectId();await Project.collection.insertOne({_id:missingProjectId,projectName:'Legacy missing ID',projectCode:'MISSING-ID',status:'ARCHIVED',createdBy:admin._id});
  const {spawnSync}=await import('node:child_process'),migrationUri=new URL(process.env.CPM_TEST_MONGO_URI);migrationUri.pathname='/'+dbName;
  const dry=spawnSync(process.execPath,['src/scripts/backfillInternalIds.js'],{cwd:new URL('../',import.meta.url).pathname.replace(/\/integration\/$/,'/'),env:{...process.env,MONGODB_URI:migrationUri.toString()},encoding:'utf8',timeout:30000});
  assert.equal(dry.status,0,dry.stderr);assert.equal((await Project.collection.findOne({_id:missingProjectId})).projectId,undefined);
  const applied=spawnSync(process.execPath,['src/scripts/backfillInternalIds.js','--apply'],{cwd:new URL('../',import.meta.url).pathname.replace(/\/integration\/$/,'/'),env:{...process.env,MONGODB_URI:migrationUri.toString()},encoding:'utf8',timeout:30000});
  assert.equal(applied.status,0,applied.stderr);const backfilled=await Project.collection.findOne({_id:missingProjectId});assert.match(backfilled.projectId,/^PRJ-\d{6}$/);assert.equal(backfilled.status,'ARCHIVED');assert.equal(String(backfilled._id),String(missingProjectId));assert.equal((await Project.findById(project._id)).projectId,'PRJ-1');assert.ok(await ActivityLog.exists({action:'INTERNAL_ID_BACKFILL',outcome:'SUCCEEDED'}));

 }catch(error){t.diagnostic("Original integration failure: "+error.stack);throw error;}finally{
  abort.abort();server.closeAllConnections();await new Promise(r=>server.close(r));if(mongoose.connection.readyState===1)await mongoose.connection.dropDatabase();await mongoose.disconnect();
 }
});
