import {randomUUID,createHash} from 'node:crypto';
import OfficeCashReview from '../models/OfficeCashReview.js';
import CashLedgerEntry from '../models/CashLedgerEntry.js';
import {loadFinancialData} from '../services/financialReportService.js';
import {cashOfficeView} from '../services/cashOfficeView.js';
import {cashMutation,validateCashTimeline} from '../services/cashMovementService.js';
import {fail,parseMethods} from '../utils/financialReporting.js';
import {moneyCents,validDate,today} from '../utils/accounting.js';
import {logActivity} from '../utils/activityLogger.js';
import {reportIdentity} from '../services/companyBranding.js';
import {reportWorkbook} from '../utils/listReport.js';
const dates=query=>{const from=query.from||today(),to=query.to||today();if(!validDate(from)||!validDate(to)||from>to||to>today())fail('Choose valid cash dates through today.');return {from,to}};
export async function cashOffice(req,res,next){try{
 const {from,to}=dates(req.query),data=await loadFinancialData(to),view=cashOfficeView(data,from,to,{q:String(req.query.q||'').slice(0,100),kind:req.query.kind||'',methods:parseMethods(req.query.methods)}),brand=await reportIdentity();
 if(req.query.format==='xlsx'){
 if(req.query.expectedSnapshot!==view.snapshot)fail('Cash records changed. Refresh the preview before downloading.',409);
 const headers=['Date','Reference','Transaction','Client / Payee','Method','Cash In PHP','Cash Out PHP','Running Balance PHP'];
 const report={...brand,title:'Office Cash Flow',generatedOn:new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'}),filters:{from,to},count:view.count,headers,rows:view.rows.map(r=>[r.date,r.sourceId,r.source,r.party,r.method,r.cashInCents/100,r.cashOutCents/100,r.runningCents===null?'Unavailable':r.runningCents/100]),summary:view.summary};
 res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('office-cash-flow.xlsx').send(await reportWorkbook(report));return;
 }
 const page=Math.max(1,parseInt(req.query.page)||1),limit=25,rows=req.query.preview==='1'?view.rows:view.rows.slice((page-1)*limit,page*limit);
 const currentData=to===today()?data:await loadFinancialData(today()),current=cashOfficeView(currentData,today(),today());
 res.json({success:true,data:{...view,...brand,rows,page,pageSize:limit,openingBaselineDate:data.entries.find(e=>e.kind==='OPENING'&&e.status==='POSTED')?.effectiveDate||current.cash.anchorDate,currentCashCents:current.cash.closingCents,currentAvailable:current.cash.available,currentReasons:current.cash.reasons,generatedOn:new Date().toLocaleString('en-PH',{timeZone:'Asia/Manila'})}});
}catch(e){next(e)}}
export async function listOfficeReviews(req,res,next){try{
 const type=req.query.type||'TURNOVER';if(!['TURNOVER','COUNT'].includes(type))fail('Choose a valid office cash review type.');
 const page=Math.max(1,parseInt(req.query.page)||1),q=String(req.query.q||'').toLowerCase().slice(0,100);
 const rows=(await OfficeCashReview.find({type}).sort({date:-1,createdAt:-1}).lean()).filter(r=>(!req.query.status||r.status===req.query.status)&&[r.reviewId,r.recipient,r.reference,r.remarks,r.preparedBy].join(' ').toLowerCase().includes(q)&&(!req.query.from||r.date>=req.query.from)&&(!req.query.to||r.date<=req.query.to));
 const visible=rows.slice((page-1)*25,page*25),releases=await CashLedgerEntry.find({entryId:{$in:visible.map(r=>r.entryId).filter(Boolean)}}).lean();
 res.json({success:true,data:{rows:visible.map(r=>({...r,...(r.entryId?{effectiveRelease:releases.find(e=>e.entryId===r.entryId)||null}:{})})),total:rows.length,page,pageSize:25}});
}catch(e){next(e)}}
export async function createOfficeReview(req,res,next){try{
 const {type,date,requestId}=req.body,amountCents=moneyCents(req.body.amount),recipient=String(req.body.recipient||'').trim(),reference=String(req.body.reference||'').trim(),remarks=String(req.body.remarks||'').trim();
 if(!['TURNOVER','COUNT'].includes(type)||!validDate(date)||date>today()||!Number.isSafeInteger(amountCents)||amountCents<0||type==='TURNOVER'&&(!amountCents||!recipient)||recipient.length>160||reference.length>160||remarks.length>500||!/^[A-Za-z0-9_-]{16,100}$/.test(requestId||'')||req.body.confirm!==true)fail('Confirm a valid date, amount and turnover recipient.');
 const input={type,date,amountCents,recipient,reference,remarks};const duplicate=await OfficeCashReview.findOne({requestId}).lean();if(duplicate){if(Object.entries(input).some(([k,v])=>duplicate[k]!==v))fail('Submission ID belongs to another request.',409);return res.json({success:true,data:duplicate,message:'This review was already saved.'})}
 const data=await loadFinancialData(date),view=cashOfficeView(data,date,date);if(!view.cash.available)fail(view.cash.reasons.join(' '),409);
 if(type==='TURNOVER'&&amountCents>view.cash.closingCents)fail('Turnover exceeds available cash on its date.',409);
 const row=await OfficeCashReview.create({_id:createHash('sha256').update(requestId).digest('hex').slice(0,24),...input,reviewId:`${type==='COUNT'?'CCR':'TOR'}-${randomUUID()}`,requestId,systemCents:view.cash.closingCents,differenceCents:type==='COUNT'?amountCents-view.cash.closingCents:undefined,systemSnapshot:view.snapshot,createdBy:req.user._id,preparedBy:req.user.username,history:[{action:'DRAFT_CREATED',username:req.user.username,timestamp:new Date()}]});
 await logActivity({req,action:'OFFICE_CASH_REVIEW_CREATED',entityType:'OfficeCashReview',entityId:String(row._id),metadata:input});res.status(201).json({success:true,data:row,message:'Draft saved. No cash movement was recorded.'});
}catch(e){if(e.code===11000)return next(Object.assign(new Error('Submission already exists. Refresh the review list before retrying.'),{statusCode:409}));next(e)}}
export async function officeReviewAction(req,res,next){try{
 const {action,expectedVersion}=req.body;if(!['SUBMIT','APPROVE','RELEASE','CANCEL'].includes(action)||req.body.confirm!==true||!Number.isSafeInteger(expectedVersion))fail('Confirm an explicit review action and current version.');
 const work=async session=>{
 const row=await OfficeCashReview.findById(req.params.id).session(session).lean();if(!row)fail('Office cash review not found.',404);if(row.status==='RELEASED'&&action==='RELEASE')return row;
 if((row.__v||0)!==expectedVersion)fail('Review changed. Refresh before continuing.',409);
 const status=action==='SUBMIT'?'PENDING_APPROVAL':action==='APPROVE'?'APPROVED':action==='RELEASE'?'RELEASED':'CANCELLED';
 if(action==='SUBMIT'&&row.status!=='DRAFT'||action==='APPROVE'&&row.status!=='PENDING_APPROVAL'||action==='RELEASE'&&(row.status!=='APPROVED'||row.type!=='TURNOVER')||action==='CANCEL'&&['CANCELLED','RELEASED'].includes(row.status))fail('Action is not available for the current review status.',409);
 const values={status};
 if(action==='APPROVE'){
 const data=await loadFinancialData(row.date,session),view=cashOfficeView(data,row.date,row.date);if(!view.cash.available)fail(view.cash.reasons.join(' '),409);
 if(row.type==='COUNT'&&view.snapshot!==row.systemSnapshot)fail('Cash changed since counting. Record a fresh count; no adjustment was posted.',409);
 values.approvedBy=req.user.username;
 }
 if(action==='RELEASE'){
 const releaseDate=req.body.releaseDate;if(!validDate(releaseDate)||releaseDate>today()||releaseDate<row.date)fail('Choose a valid actual release date on or after the request date.');
 const entryId='CASH-'+randomUUID();await CashLedgerEntry.create([{entryId,requestId:'TURNOVER-'+row._id,kind:'OWNER_TURNOVER',effectiveDate:releaseDate,amountCents:row.amountCents,recipient:row.recipient,reference:row.reference||row.reviewId,reason:row.remarks,createdBy:req.user._id,actorUsername:req.user.username,authorizedBy:row.approvedBy,history:[{action:'APPROVED_TURNOVER_RELEASED',reviewId:row.reviewId,username:req.user.username,timestamp:new Date()}]}],{session});
 await validateCashTimeline(session);Object.assign(values,{releasedDate:releaseDate,releasedBy:req.user.username,entryId});
 }
 const saved=await OfficeCashReview.findOneAndUpdate({_id:row._id,__v:row.__v},{$set:values,$inc:{__v:1},$push:{history:{action,username:req.user.username,timestamp:new Date(),remarks:String(req.body.reason||'').slice(0,500)}}},{new:true,session});if(!saved)fail('Review changed. Refresh first.',409);return saved;
 };
 const result=action==='RELEASE'?await cashMutation(work):await work(null);
 await logActivity({req,action:'OFFICE_CASH_REVIEW_'+action,entityType:'OfficeCashReview',entityId:String(result._id),metadata:{status:result.status,entryId:result.entryId}});
 res.json({success:true,data:result,message:action==='RELEASE'?'Actual turnover released once into the existing cash ledger.':action==='APPROVE'?'Review approved. No cash was deducted.':'Review updated. No cash movement was recorded.'});
}catch(e){next(e)}}
