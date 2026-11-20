import { reservationExpiry } from '../../../shared/reservationDates.js';
import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import ReservationSettings from '../models/ReservationSettings.js';
import Reservation from '../models/Reservation.js';
import Property from '../models/Property.js';
import {syncClientLifecycleFromContracts} from './clientLifecycleSync.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import Client from '../models/Client.js';
import Project from '../models/Project.js';
import Agent from '../models/Agent.js';
import ReceiptClaim from '../models/ReceiptClaim.js';
import { cashMutation, validateCashTimeline } from './cashMovementService.js';
import { checkReceipt, receiptScope, validateReceipt } from './receiptService.js';
import { METHODS, moneyCents, today, validDate } from '../utils/accounting.js';
import { fail } from '../utils/financialReporting.js';
import { validateFunding } from '../utils/fundingAccount.js';
import { generateRecordId } from '../utils/generateRecordId.js';
import {lotPrice} from '../utils/lotPricing.js';
import { trackedBackgroundWrite } from './maintenanceGate.js';
import { assertContractOperationsReady } from './databaseReadiness.js';
import { allocatePayments } from '../utils/paymentLedger.js';
import {prepareNewContract} from '../utils/newContract.js';
import {monitoringMutation} from './monitoringService.js';

const creditPolicies=['ANY_PRINCIPAL','DOWN_PAYMENT','FIRST_INSTALLMENT'];
const restricted = ['PENDING','REJECTED'];
const openAccounts = { lifecycle: { $nin: ['TRANSFERRED','ASSUMED','CANCELLED','FORFEITED','SUPERSEDED'] } };
const text = value => typeof value === 'string' ? value.trim().slice(0, 1500) : '';
const actor = user => ({ userId:user._id, username:user.username, role:user.role });
const event = (action,user,details={}) => ({action,...actor(user),timestamp:new Date(),...details});
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const eligiblePrecontractPayments=row=>[...(row.paymentPurpose==='DOWN_PAYMENT'&&row.disposition==='OUTSTANDING'?[{...row.payment,requestId:row.requestId,type:'DOWN_PAYMENT'}]:[]),...(row.precontractPayments||[])].filter(p=>!(row.precontractRefunds||[]).some(r=>r.paymentId===p.paymentId)&&!(row.appliedPrecontractPaymentIds||[]).includes(p.paymentId));
const reservationFee=row=>row.paymentPurpose==='DOWN_PAYMENT'?0:row.payment.amountCents;
const id = value => {
  if(typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) fail('Choose a valid record.');
  return value;
};
export function addDays(date, days) {
  return new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}
export async function defaultReservationDays(session=null) {
  const settings=await ReservationSettings.findById('OFFICE').session(session).lean();
  if(settings)return settings.holdDays;
  const days=Number(process.env.RESERVATION_HOLD_DAYS);
  return Number.isInteger(days)&&days>=1&&days<=365 ? days : 7;
};
export function reservationStatus(row, day=today()) {
  return row.held && row.expiresOn<day ? 'EXPIRED' : row.status;
}
export function reservationDisplay(row, day=today()) {
  const remainingDays=Math.round((Date.parse(row.expiresOn)-Date.parse(day))/86400000);
  return { status:reservationStatus(row,day), startDate:row.startDate||row.payment.paymentDate, expiresOn:row.expiresOn, remainingDays, amountCents:row.payment.amountCents,paymentPurpose:row.paymentPurpose||'RESERVATION_FEE',feeCents:reservationFee(row),pendingDownPaymentCents:eligiblePrecontractPayments(row).reduce((n,p)=>n+p.amountCents,0) };
}
export async function expireReservations(day=today()) {
  await Reservation.updateMany({status:'ACTIVE',held:true,expiresOn:{$lt:day}},
    {$set:{status:'EXPIRED'},$inc:{__v:1},$push:{history:{action:'EXPIRED',timestamp:new Date(),effectiveDate:day}}});
}
export function startReservationMonitoring(){
  const run=()=>trackedBackgroundWrite(expireReservations).catch(e=>console.error('Reservation monitoring failed',e.message));
  run();
  const timer=setInterval(run,60000);
  timer.unref();
}
function paymentInput(body) {
  const amountCents=moneyCents(body.amount), paymentDate=body.paymentDate;
  if(!amountCents||!validDate(paymentDate)||paymentDate>today()||!METHODS.includes(body.method)) fail('Enter a positive amount, a valid payment date, and a payment method.');
  return {amountCents,paymentDate,method:body.method,fundingAccount:validateFunding(body.method,body.fundingAccount),receiptNumber:validateReceipt(body.receiptNumber),receiptScope:receiptScope()};
}
export async function postReservation(body,user) {
  const propertyId=id(body.propertyId),clientId=id(body.clientId),agentId=body.agentId?id(body.agentId):undefined;
  const requestId=body.requestId;
  if(typeof requestId!=='string'||!/^[\w-]{16,100}$/.test(requestId))fail('Reload the reservation form before submitting.');
  const payment=paymentInput(body);
  if(text(body.reference))payment.reference=text(body.reference).slice(0,120);
  const terms=text(body.terms),creditPolicy=body.creditPolicy,paymentPurpose=body.paymentPurpose||'RESERVATION_FEE';
  if(!['RESERVATION_FEE','DOWN_PAYMENT'].includes(paymentPurpose)||paymentPurpose==='DOWN_PAYMENT'&&creditPolicy!=='DOWN_PAYMENT')fail('Choose valid receipt purpose and credit terms.');
  if(!creditPolicies.includes(creditPolicy))fail('Choose how the reservation agreement allows the fee to be applied.');
  if(!terms||body.confirmed!==true)fail('Review and confirm the reservation terms.');
  const startDate=body.startDate??payment.paymentDate;
  if(!validDate(startDate)||startDate>today())fail('Choose a valid reservation start date through today.');
  const defaultExpiry=reservationExpiry(startDate,await defaultReservationDays());
  const calculated=body.holdDays===undefined?null:reservationExpiry(startDate,body.holdDays);
  if(calculated==='')fail('Enter a holding period from 1 to 365 days.');
  if(calculated&&body.expiresOn!==undefined&&body.expiresOn!==calculated)fail('The expiry date does not match the holding period.');
  const expiresOn=calculated??body.expiresOn??defaultExpiry;
  if(!validDate(expiresOn)||expiresOn<today()||expiresOn<=startDate||expiresOn>reservationExpiry(startDate,365))fail('Choose a hold expiry after the start date, within 365 days, that has not passed.');
  if(expiresOn!==defaultExpiry&&(user.role!=='ADMIN'||!text(body.reason)))fail('An administrator and an override reason are required for a custom expiry.',403);
  const submissionHash=hash({propertyId,clientId,agentId,payment,terms,creditPolicy,expiresOn,notes:text(body.notes),...(paymentPurpose==='DOWN_PAYMENT'?{paymentPurpose}:{}),...(startDate!==payment.paymentDate?{startDate}:{})});
  const indexes=await Reservation.collection.indexes().catch(e=>{if(e.code===26)return [];throw e});
  if(!indexes.some(i=>i.unique&&i.key.requestId===1)||!indexes.some(i=>i.unique&&i.key.property===1&&i.key.held===1&&i.partialFilterExpression?.held===true))
    fail('Reservation indexes require one-time approved setup in Database & Backups.',409);
  const reservationId=new mongoose.Types.ObjectId(),paymentId=await generateRecordId('payment');
  return cashMutation(async session=>{
    const existing=await Reservation.findOne({requestId}).session(session);
    if(existing){
      if(existing.payment.submissionHash!==submissionHash)fail('This submission was already used for another reservation.',409);
      return existing;
    }
    const currentDefault=reservationExpiry(startDate,await defaultReservationDays(session));
    if((expiresOn===defaultExpiry||user.role!=='ADMIN')&&currentDefault!==defaultExpiry)fail('The default hold period changed. Refresh and review the new expiry.',409);
    const client=await Client.findById(clientId).session(session);
    if(!client||client.deletedAt)fail('Choose an existing buyer or register a prospect.',409);
    if(agentId&&!(await Agent.exists({_id:agentId,status:'ACTIVE'}).session(session)))fail('Choose an active agent.',409);
    const lot=await Property.findOneAndUpdate({_id:propertyId,status:'AVAILABLE',client:null,reservation:null,reopeningStatus:{$nin:restricted},assumptionStatus:{$ne:'PENDING'}},
      {$set:{status:'RESERVED',reservation:reservationId,hasReservationHistory:true},$inc:{__v:1}},{new:true,session});
    if(!lot||await PropertyAssignment.exists({property:propertyId,...openAccounts}).session(session))fail('This lot already has a hold, restriction, or active contract.',409);
    if(!(await Project.exists({_id:lot.project,status:{$ne:'ARCHIVED'}}).session(session)))fail('This project cannot accept reservations.',409);
    await checkReceipt(payment.receiptNumber,payment.receiptScope,reservationId,paymentId,requestId,true,false,session);
    if(paymentPurpose==='DOWN_PAYMENT'&&payment.amountCents>moneyCents(lotPrice(lot.areaSqm,lot.pricePerSqm)))fail('Down payment exceeds the property price.');
    const [record]=await Reservation.create([{_id:reservationId,property:propertyId,project:lot.project,client:clientId,agent:agentId,requestId,startDate,expiresOn,terms,creditPolicy,paymentPurpose,notes:text(body.notes),
      payment:{...payment,paymentId,submissionHash,createdAt:new Date(),createdBy:user._id,actorUsername:user.username,actorRole:user.role},
      history:[event('RESERVED',user,{reason:text(body.reason),expiresOn})]}],{session});
    return record;
  });
}
export function conversionAmounts(schedule, installment, fee) {
  const target=schedule.find(row=>row.installment===installment);
  if(!target||target.amountCents<fee)fail('Choose a principal payment that can accept the full reservation credit.');
  return {target, additionalCents:target.amountCents-fee};
}
export function conversionCreditPlan(contract,installment,fee,additionalAmount,allowOutstanding,priorDownPaymentCents=0){
  if(!Number.isSafeInteger(priorDownPaymentCents)||priorDownPaymentCents<0||priorDownPaymentCents>contract.downPaymentCents)fail('Previously received down payments exceed the agreed down payment. Review contractual terms.');
  const {target,additionalCents:maximum}=conversionAmounts(contract.schedule,installment,fee+(installment===0?priorDownPaymentCents:0));
  const additionalCents=moneyCents(additionalAmount||0);
  if(additionalCents>maximum)fail('Additional money exceeds the remaining selected principal payment.');
  const remainingDownPaymentCents=contract.downPaymentCents-priorDownPaymentCents-(installment===0?fee+additionalCents:0);
  const remainingTargetCents=maximum-additionalCents;
  if((remainingDownPaymentCents||remainingTargetCents)&&allowOutstanding!==true)fail('Confirm that the agreement permits the remaining scheduled amount to stay unpaid, or save a draft.');
  return {target,additionalCents,creditCents:fee,priorDownPaymentCents,remainingDownPaymentCents,remainingTargetCents,remainingPrincipalCents:contract.totalCents-fee-additionalCents-priorDownPaymentCents};
}
export async function postPrecontractPayment(reservationId,body,user){
 id(reservationId);const requestId=body.requestId;
 if(typeof requestId!=='string'||!/^[\w-]{16,100}$/.test(requestId)||body.confirmed!==true)fail('Review and confirm the original receipt before posting.');
 const payment={...paymentInput(body),type:'DOWN_PAYMENT',reference:text(body.reference).slice(0,120)},submissionHash=hash(payment);
 const paymentId=await generateRecordId('payment');
 return cashMutation(async session=>{
   const row=await Reservation.findById(reservationId).session(session);
   if(!row)fail('Reservation not found.',404);
   if(String(row.client)!==body.clientId||String(row.property)!==body.propertyId)fail('Buyer or property changed. Reload the reservation.',409);
   const prior=(row.precontractPayments||[]).find(p=>p.requestId===requestId);
   if(prior){if(prior.submissionHash!==submissionHash)fail('This submission was already used for a different receipt.',409);return prior;}
   if(!row.held||reservationStatus(row)!=='ACTIVE'||row.disposition!=='OUTSTANDING'||payment.paymentDate<(row.startDate||row.payment.paymentDate))fail('Down payment requires an active held reservation with unresolved credit and a date on or after its start.',409);
   const lot=await Property.findOne({_id:row.property,reservation:row._id,status:'RESERVED',client:null}).session(session);
   if(!lot||await PropertyAssignment.exists({property:row.property,...openAccounts}).session(session))fail('The reservation lot is no longer eligible.',409);
   const projected=eligiblePrecontractPayments(row).reduce((n,p)=>n+p.amountCents,0)+payment.amountCents;
   const price=prepareNewContract(lot,{months:1,contractDate:today(),firstDueDate:today(),downPayment:0},today()).totalCents;
   if(projected+reservationFee(row)>price)fail('Previously received money plus this deposit exceeds the property price.',409);
   await checkReceipt(payment.receiptNumber,payment.receiptScope,row._id,paymentId,requestId,true,false,session);
   const saved={...payment,paymentId,requestId,submissionHash,createdAt:new Date(),createdBy:user._id,actorUsername:user.username,actorRole:user.role};
   row.precontractPayments.push(saved);row.increment();row.history.push(event('PRECONTRACT_DOWN_PAYMENT_POSTED',user,{paymentId,amountCents:saved.amountCents}));await row.save({session});return saved;
 });
}
async function conversionPlan(row,body,session=null) {
  if(!row.held||reservationStatus(row)!=='ACTIVE'||row.disposition!=='OUTSTANDING')fail('Only an active reservation with unresolved credit can be converted. Extend or review the original hold first.',409);
  if(!text(body.reason))fail('Enter the approved contract or conversion reason.');
  const lot=await Property.findOne({_id:row.property,reservation:row._id,status:'RESERVED',client:null,reopeningStatus:{$nin:restricted},assumptionStatus:{$ne:'PENDING'}}).session(session);
  if(!lot||!(await Project.exists({_id:row.project,status:{$ne:'ARCHIVED'}}).session(session)))fail('The lot or project can no longer be converted.',409);
  if(await PropertyAssignment.exists({property:lot._id,...openAccounts}).session(session))fail('This lot already has an active or protected account.',409);
  if(!(await Client.exists({_id:row.client,deletedAt:null}).session(session)))fail('The buyer profile is unavailable.',409);
  if((body.expectedAreaSqm!==undefined&&body.expectedAreaSqm!==lot.areaSqm)||(body.expectedPricePerSqm!==undefined&&body.expectedPricePerSqm!==lot.pricePerSqm))fail('The lot price changed. Refresh and review before converting.',409);
  const contract=prepareNewContract(lot,{...body,contractDate:body.contractDate||today()},today());
  const installment=body.installment===''||body.installment==null?NaN:Number(body.installment);
  if(!Number.isInteger(installment))fail('Choose a contract installment for the reservation credit.');
  if(row.creditPolicy==='DOWN_PAYMENT'&&installment!==0||row.creditPolicy==='FIRST_INSTALLMENT'&&installment!==1)
    fail('The selected payment does not match the reservation credit terms.',409);
  // Conversion cannot assume that the remaining target amount was received.
  const precontractPayments=eligiblePrecontractPayments(row);
  const priorDownPaymentCents=precontractPayments.reduce((n,p)=>n+p.amountCents,0);
  const creditPlan=conversionCreditPlan(contract,installment,reservationFee(row),body.additionalAmount,body.allowOutstanding,priorDownPaymentCents);
  const {additionalCents}=creditPlan;
  const payment=additionalCents?paymentInput({...body,amount:additionalCents/100,paymentDate:body.paymentDate||today()}):null;
  if(payment&&payment.paymentDate!==today())fail('Only money actually received today may be posted during conversion. Do not re-enter earlier receipts.');
  if(payment&&text(body.reference))payment.reference=text(body.reference).slice(0,120);
  return {contract,...creditPlan,precontractPayments,payment,activationDate:today(),version:row.__v,lotVersion:lot.__v,reason:text(body.reason),allowOutstanding:body.allowOutstanding===true};
}
export async function previewConversion(reservationId,body) {
  const row=await Reservation.findById(id(reservationId));
  if(!row)fail('Reservation not found.',404);
  const plan=await conversionPlan(row,body);
  return {...plan,token:hash(plan)};
}
export async function convertReservation(reservationId,body,user) {
  id(reservationId);
  if(body.confirmed!==true||typeof body.token!=='string')fail('Preview and confirm the conversion first.');
  await assertContractOperationsReady();
  const assignmentId=await generateRecordId('contract'),paymentId=await generateRecordId('payment'),accountId=new mongoose.Types.ObjectId();
  return cashMutation(async session=>{
    const row=await Reservation.findById(reservationId).session(session);
    if(!row)fail('Reservation not found.',404);
    if(row.status==='CONVERTED'&&row.history.at(-1)?.token===body.token)return row;
    const plan=await conversionPlan(row,body,session);
    if(hash(plan)!==body.token)fail('The terms or reservation changed. Review a fresh preview.',409);
    const claim=await Property.updateOne({_id:row.property,reservation:row._id,__v:plan.lotVersion,status:'RESERVED',client:null},
      {$set:{status:'SOLD',client:row.client,reservation:null},$inc:{__v:1}},{session});
    if(!claim.modifiedCount)fail('The lot changed. Refresh the reservation.',409);
    const allocation=(amountCents)=>[{installmentId:`I${plan.target.installment}`,amountCents}];
    const reservationCredit=plan.creditCents?{reservationCreditId:String(row._id),paymentId:'CREDIT-'+row.payment.paymentId,originalPaymentId:row.payment.paymentId,originalPaymentDate:row.payment.paymentDate,paymentDate:plan.activationDate,
      amountCents:plan.creditCents,allocationPlan:allocation(plan.creditCents)}:undefined;
    // Consume original receipts once: the reservation retains evidence; the
    // account now owns their contractual allocations and receipt claims.
    const payments=[];
    for(const original of plan.precontractPayments){
      const moved=await ReceiptClaim.updateOne({accountId:row._id,paymentId:original.paymentId,requestId:original.requestId},{$set:{accountId}},{session});
      if(moved.modifiedCount!==1)fail('Original down-payment receipt claim requires reconciliation.',409);
      payments.push({...original,sourceReservationId:String(row._id),contractAllocationDate:plan.activationDate,allocationPlan:[{installmentId:'I0',amountCents:original.amountCents}]});
    }
    if(plan.payment){
      const requestId=randomUUID();
      await checkReceipt(plan.payment.receiptNumber,plan.payment.receiptScope,accountId,paymentId,requestId,true,false,session);
      payments.push({...plan.payment,type:plan.target.installment===0?'DOWN_PAYMENT':'INSTALLMENT',paymentId,requestId,createdBy:user._id,
        actorUsername:user.username,actorRole:user.role,createdAt:new Date(),allocationPlan:allocation(plan.additionalCents)});
    }
    const account={_id:accountId,assignmentId,client:row.client,project:row.project,property:row.property,contract:plan.contract,
      createdBy:user._id,reservationCredit,payments,lifecycle:'ACTIVE',penaltyCalculationRule:'CURRENT_OVERDUE',
      auditEvents:[event('RESERVATION_CONVERTED',user,{reservationId:row._id,reason:plan.reason})]};
    const ledger=allocatePayments(account);
    for(const payment of payments)payment.allocations=ledger.allocations[payment.paymentId];
    const monitoring=monitoringMutation(account,actor(user),'Reservation contract activated');
    if(monitoring.changed){
      Object.assign(account,monitoring.update.$set);
      for(const [key,value] of Object.entries(monitoring.update.$push))account[key]=[...(account[key]||[]),...(value.$each||[value])];
    }
    await PropertyAssignment.create([account],{session});
    await syncClientLifecycleFromContracts(row.client,{userId:user._id,username:user.username,role:user.role},"Reservation converted to sale",session);
    row.status='CONVERTED';
    row.held=false;
    row.account=accountId;
    row.disposition='APPLIED';
    row.appliedPrecontractPaymentIds=plan.precontractPayments.map(p=>p.paymentId);
    row.increment();
    row.history.push(event('CONVERTED',user,{accountId,creditCents:plan.creditCents,additionalCents:plan.additionalCents,reason:plan.reason,token:body.token}));
    await row.save({session});
    return row;
  });
}
export async function manageReservation(reservationId,body,user) {
  id(reservationId);
  const reason=text(body.reason), action=body.action;
  if(!reason)fail('Enter a reason for this action.');
  if(!['EXTEND','CORRECT','CANCEL','RELEASE','DISPOSITION','DRAFT','REFUND_PRECONTRACT'].includes(action))fail('Choose a reservation action.');
  if(body.confirmed!==true)fail('Confirm the selected reservation action.');
  return cashMutation(async session=>{
    const row=await Reservation.findById(reservationId).session(session);
    if(!row)fail('Reservation not found.',404);
    if(row.__v!==body.version)fail('The reservation changed. Refresh before retrying.',409);
    if(action==='REFUND_PRECONTRACT'){
      const payment=eligiblePrecontractPayments(row).find(p=>p.paymentId===body.paymentId);
      if(!payment||row.status==='CONVERTED')fail('Choose an unapplied down-payment receipt.',409);
      if(!METHODS.includes(body.method)||!validDate(body.date)||body.date<payment.paymentDate||body.date>today()||!text(body.reference))fail('Enter actual refund date, method and reference.');
      const refund={paymentId:payment.paymentId,date:body.date,amountCents:payment.amountCents,method:body.method,fundingAccount:validateFunding(body.method,body.fundingAccount),reference:text(body.reference),...actor(user)};
      row.precontractRefunds.push(refund);if(row.paymentPurpose==='DOWN_PAYMENT'&&row.payment.paymentId===payment.paymentId)row.disposition='REFUNDED';row.increment();row.history.push(event('PRECONTRACT_DOWN_PAYMENT_REFUNDED',user,{reason,...refund}));await row.save({session});
      if(refund.fundingAccount==='CASH')await validateCashTimeline(session,{releaseDate:refund.date,amountCents:refund.amountCents});return row;
    }
    if(action==='DRAFT'){
      if(!row.held||reservationStatus(row)!=='ACTIVE')fail('Only an active reservation can have a contract draft.',409);
      // Store proposed terms only. Never persist new-money receipt fields in a draft.
      const keys=['months','termType','contractDate','firstDueDate','downPayment','monthlyInstallment','monthlyInstallmentOverride','monthlyOverrideAcknowledged','installment','allowOutstanding'];
      const draft=Object.fromEntries(keys.filter(k=>['string','number','boolean'].includes(typeof body[k])).map(k=>[k,typeof body[k]==='string'?body[k].slice(0,100):body[k]]));
      const termKeys=['frequency','pendingPaymentPolicy','penaltyBasis','allocationPriority','penaltyStatus','effectiveDate','dueDay','graceDays','penaltyPercentage','forfeitureMonths','criticalMonths','reminderDays'];
      draft.monitoringTerms=body.monitoringTerms&&typeof body.monitoringTerms==='object'?Object.fromEntries(termKeys.filter(k=>['string','number','boolean'].includes(typeof body.monitoringTerms[k])).map(k=>[k,typeof body.monitoringTerms[k]==='string'?body.monitoringTerms[k].slice(0,100):body.monitoringTerms[k]])):null;
      const previous=row.contractDraft||null;
      row.contractDraft={values:draft,reason,...actor(user),timestamp:new Date()};
      row.increment();row.history.push(event('CONTRACT_DRAFT_SAVED',user,{reason,previous,updated:row.contractDraft}));await row.save({session});return row;
    }
    if(['EXTEND','CORRECT','CANCEL','RELEASE'].includes(action)&&!row.held)fail('This reservation no longer holds a lot.',409);
    const previous={status:row.status,expiresOn:row.expiresOn,terms:row.terms,creditPolicy:row.creditPolicy,notes:row.notes,disposition:row.disposition};
    if(action==='EXTEND'){
      if(!validDate(body.expiresOn)||body.expiresOn<=row.expiresOn||body.expiresOn<today()||body.expiresOn>addDays(today(),365))fail('Choose a later expiry within the next 365 days.');
      row.expiresOn=body.expiresOn;
      row.status='ACTIVE';
    }
    if(action==='CORRECT'){
      if(!text(body.terms))fail('Enter the corrected reservation terms.');
      if(!creditPolicies.includes(body.creditPolicy))fail('Choose the correct reservation credit terms.');
      if(row.paymentPurpose==='DOWN_PAYMENT'&&body.creditPolicy!=='DOWN_PAYMENT')fail('An initial down-payment receipt must remain allocated to the approved down payment.');
      row.creditPolicy=body.creditPolicy;
      row.terms=text(body.terms);
      row.notes=text(body.notes);
    }
    if(action==='RELEASE'||action==='CANCEL'){
      if(eligiblePrecontractPayments(row).length)fail('Resolve or refund all unapplied down-payment receipts before releasing this reservation.',409);
      if(action==='RELEASE'&&reservationStatus(row)!=='EXPIRED')fail('Only an expired hold can be released. Cancel an active reservation instead.',409);
      if(await PropertyAssignment.exists({property:row.property,...openAccounts}).session(session))fail('The lot has a protected contract. Review it before releasing the hold.',409);
      if(!(await Project.exists({_id:row.project,status:{$ne:'ARCHIVED'}}).session(session)))fail('The project is restricted.',409);
      const released=await Property.updateOne({_id:row.property,reservation:row._id,status:'RESERVED',client:null,reopeningStatus:{$nin:restricted},assumptionStatus:{$ne:'PENDING'}},
        {$set:{status:'AVAILABLE',reservation:null},$inc:{__v:1}},{session});
      if(!released.modifiedCount)fail('A lot restriction or another change prevents release.',409);
      row.status=action==='CANCEL'?'CANCELLED':'RELEASED';
      row.held=false;
    }
    if(action==='DISPOSITION'){
      if(row.held||row.disposition!=='OUTSTANDING'||!['REFUNDED','RETAINED'].includes(body.disposition))fail('Only an unresolved fee on a released or cancelled reservation can be disposed.',409);
      if(!text(body.reference))fail('Enter the supporting agreement or actual payout reference.');
      if(body.disposition==='REFUNDED'){
        if(!METHODS.includes(body.method)||!validDate(body.date)||body.date<row.payment.paymentDate||body.date>today())fail('Enter the actual refund date and payment method.');
        const fundingAccount=validateFunding(body.method,body.fundingAccount);
        row.refund={date:body.date,amountCents:row.payment.amountCents,method:body.method,fundingAccount,reference:text(body.reference),...actor(user)};
      }
      row.disposition=body.disposition;
    }
    row.increment();
    row.history.push(event(action,user,{reason,reference:text(body.reference),previous,expiresOn:row.expiresOn,disposition:row.disposition}));
    await row.save({session});
    if(row.refund?.fundingAccount==='CASH'&&action==='DISPOSITION')await validateCashTimeline(session,{releaseDate:row.refund.date,amountCents:row.refund.amountCents});
    return row;
  });
}
