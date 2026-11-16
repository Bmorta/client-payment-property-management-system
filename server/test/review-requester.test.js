import test from 'node:test';import assert from 'node:assert/strict';
import {buildReviewRows,adminReviewData} from '../src/services/adminReviews.js';
import {reviewActor} from '../src/utils/auditValues.js';
import {reviewIdentity,LEGACY_REVIEW_USER} from '../src/utils/reviewIdentity.js';
const requested='2026-01-01T01:00:00Z',decided='2026-01-02T02:00:00Z';
const maker={userId:'507f1f77bcf86cd799439011',username:'requester',fullName:'Original Requester',role:'STAFF',timestamp:requested},admin={userId:'507f1f77bcf86cd799439012',username:'approver',fullName:'Review Administrator',role:'ADMIN',timestamp:decided};
const account={_id:'account',assignmentId:'CT-1',client:{_id:'client',firstName:'Buyer',lastName:'Name'},property:{_id:'lot',propertyId:'LOT-1'}};
test('payment review preserves the initiating user and request time separately from the deciding administrator',()=>{
 const rows=buildReviewRows({accounts:[{...account,updatedAt:'2030-01-01',correctionRequests:[{requestId:'r',status:'APPROVED',requester:maker,requestedBy:maker.userId,requestedAt:requested,reviewer:admin,decidedAt:decided}]}]});const r=rows[0];assert.equal(r.requestedBy.fullName,maker.fullName);assert.equal(r.requestedBy.role,'STAFF');assert.equal(r.reviewedBy.username,'approver');assert.equal(r.requestedAt,new Date(requested).toISOString());assert.notEqual(r.requestedAt,r.updatedAt);
});
test('forfeiture and preliminary cancellation history keep the first request actor when another administrator decides',()=>{
 const start={...maker,status:'UNDER_REVIEW',action:'MARK_REVIEW'},end={...admin,status:'REJECTED',action:'REJECT'};const rows=buildReviewRows({accounts:[{...account,forfeitureReviews:[start,end],cancellationReview:{...end},cancellationReviewHistory:[{...start,action:'START'},end]}]});for(const r of rows){assert.equal(r.requestedBy.username,'requester');assert.equal(r.reviewedBy.username,'approver');assert.equal(r.requestedAt,new Date(requested).toISOString())}
});
test('durable assumption, voucher, cash, payout and migration reviews use their original submission histories',()=>{
 const history=[{action:'CREATED',...admin},{action:'SUBMIT',...maker},{action:'APPROVE',...admin}];const rows=buildReviewRows({accounts:[account],assumptions:[{_id:'a',source:'account',status:'APPROVED',history:[{action:'ASSUMPTION_REQUESTED',...maker}],decision:{administrator:admin,timestamp:decided}}],vouchers:[{_id:'v',approvalState:'APPROVED',history,preparedBy:admin,approvedBy:admin}],cash:[{_id:'c',status:'APPROVED',history}],payouts:[{_id:'p',status:'APPROVED',history}],migrations:[{_id:'m',account:'account',status:'VERIFIED',history,review:admin}]});assert.equal(rows.length,5);for(const r of rows){assert.equal(r.requestedBy.username,'requester',r.category);assert.equal(r.requestedBy.role,'STAFF');assert.equal(r.reviewedBy.username,'approver')}
});
test('legacy records do not invent a requester from the account owner, latest update, or approving administrator',()=>{
 const rows=buildReviewRows({accounts:[{...account,createdBy:maker.userId,updatedAt:decided,correctionRequests:[{requestId:'legacy',status:'PENDING'}]}],properties:[{_id:'orphan',propertyId:'ORPHAN',reopeningStatus:'PENDING'}]});for(const r of rows){assert.equal(r.requestedBy.fullName,LEGACY_REVIEW_USER);assert.equal(r.requestedBy.role,LEGACY_REVIEW_USER);assert.equal(r.requestedAt,null)}assert.equal(reviewIdentity(null,admin).requestedBy.username,LEGACY_REVIEW_USER);
});
test('new authenticated snapshots retain name and role even if the user profile later changes',()=>{
 const user={_id:maker.userId,firstName:'Actual',lastName:'Requester',username:'staff',role:'STAFF'},snapshot=reviewActor(user);user.firstName='Changed';user.role='ADMIN';assert.equal(snapshot.fullName,'Actual Requester');assert.equal(snapshot.role,'STAFF');assert.equal(snapshot.username,'staff');
});
test('review identity lookup is batched and never infers historical roles from current accounts',async t=>{
 const names=['PropertyAssignment','Property','CancellationCase','AssumptionCase','CommissionVoucher','OfficeCashReview','MigrationBatch','OfficePayout'];const models={};for(const name of names)models[name]=(await import('../src/models/'+name+'.js')).default;
 const q=value=>({select(){return this},populate(){return this},lean:async()=>value});for(const [name,model]of Object.entries(models))t.mock.method(model,'find',()=>q(name==='PropertyAssignment'?[{...account,correctionRequests:[{requestId:'r',status:'PENDING',requestedBy:maker.userId,requestedUsername:'original-login',requestedAt:requested}]}]:[]));
 const {default:User}=await import('../src/models/User.js');let filter,fields;const find=t.mock.method(User,'find',f=>{filter=f;return {select:s=>{fields=s;return q([{_id:maker.userId,firstName:'Known',lastName:'Person',username:'renamed-login',role:'ADMIN'}])}}});const data=await adminReviewData();assert.equal(find.mock.callCount(),1);assert.deepEqual(filter._id.$in,[maker.userId]);assert.ok(!fields.split(' ').includes('role'));assert.equal(data.rows[0].requestedBy.fullName,'Known Person');assert.equal(data.rows[0].requestedBy.username,'original-login');assert.equal(data.rows[0].requestedBy.role,LEGACY_REVIEW_USER);assert.equal(data.pending,1);
});
test('repeated review activity does not replace the first requester, while a later resolved cycle has its own initiator',()=>{
 const first={...maker,action:'MARK_REVIEW',status:'UNDER_REVIEW',requestId:'first'},repeat={...admin,action:'MARK_REVIEW',status:'UNDER_REVIEW',requestId:'repeat'},end={...admin,action:'REJECT',status:'REJECTED',requestId:'end'};
 let rows=buildReviewRows({accounts:[{...account,forfeitureReviews:[first,repeat,end]}]});assert.equal(rows.find(r=>r.id==='forfeiture:account').requestedBy.username,maker.username);
 const next={...admin,action:'MARK_REVIEW',status:'UNDER_REVIEW',requestId:'next'};rows=buildReviewRows({accounts:[{...account,forfeitureReviews:[first,repeat,end,next]}]});assert.equal(rows.find(r=>r.id==='forfeiture:account').requestedBy.username,admin.username);assert.equal(rows.find(r=>r.id==='forfeiture:account:history:2').requestedBy.username,maker.username);
});
