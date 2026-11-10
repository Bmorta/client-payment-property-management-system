import test from 'node:test';import assert from 'node:assert/strict';import Review from '../src/models/OfficeCashReview.js';
import {createOfficeReview,officeReviewAction} from '../src/controllers/cashOfficeController.js';
test('cash review validates confirmation, zero is legal only for counts, release action requires explicit confirmation',async()=>{
 const next=e=>{throw e},res={json(){},status(){return this}};
 await assert.rejects(()=>createOfficeReview({body:{type:'TURNOVER',date:'2026-01-01',amount:0,requestId:'test-request-12345',confirm:true}},res,next),/Confirm a valid/);
 await assert.rejects(()=>officeReviewAction({body:{action:'RELEASE',expectedVersion:0,confirm:false}},res,next),/Confirm an explicit/);
 const count=new Review({type:'COUNT',date:'2026-01-01',amountCents:0,reviewId:'COUNT-1',requestId:'count-request-12345',createdBy:'507f1f77bcf86cd799439011'});assert.equal(count.validateSync(),undefined);assert.equal(count.status,'DRAFT');
});
