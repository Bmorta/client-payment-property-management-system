import { createHash, randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import ReservationSettings from '../models/ReservationSettings.js';
import Reservation from '../models/Reservation.js';
import Property from '../models/Property.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import Client from '../models/Client.js';
import Project from '../models/Project.js';
import Agent from '../models/Agent.js';
import { cashMutation, validateCashTimeline } from './cashMovementService.js';
import { checkReceipt, receiptScope, validateReceipt } from './receiptService.js';
import { buildSchedule, METHODS, moneyCents, today, validDate } from '../utils/accounting.js';
import { fail } from '../utils/financialReporting.js';
import { validateFunding } from '../utils/fundingAccount.js';
import { generateRecordId } from '../utils/generateRecordId.js';
import { lotPrice } from '../utils/lotPricing.js';
import { trackedBackgroundWrite } from './maintenanceGate.js';
import { assertContractOperationsReady } from './databaseReadiness.js';
import { allocatePayments } from '../utils/paymentLedger.js';

const creditPolicies=['ANY_PRINCIPAL','DOWN_PAYMENT','FIRST_INSTALLMENT'];
const restricted = ['PENDING','REJECTED'];
const openAccounts = { lifecycle: { $nin: ['TRANSFERRED','ASSUMED','CANCELLED','FORFEITED','SUPERSEDED'] } };
const text = value => typeof value === 'string' ? value.trim().slice(0, 1500) : '';
const actor = user => ({ userId:user._id, username:user.username, role:user.role });
const event = (action,user,details={}) => ({action,...actor(user),timestamp:new Date(),...details});
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
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
  return { status:reservationStatus(row,day), startDate:row.payment.paymentDate, expiresOn:row.expiresOn, remainingDays, amountCents:row.payment.amountCents };
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
  const payment=paymentInput(body), terms=text(body.terms),creditPolicy=body.creditPolicy;
  if(!creditPolicies.includes(creditPolicy))fail('Choose how the reservation agreement allows the fee to be applied.');
  if(!terms||body.confirmed!==true)fail('Review and confirm the reservation terms.');
  const defaultExpiry=addDays(payment.paymentDate,await defaultReservationDays());
  const expiresOn=body.expiresOn||defaultExpiry;
  if(!validDate(expiresOn)||expiresOn<today()||expiresOn<=payment.paymentDate||expiresOn>addDays(payment.paymentDate,365))fail('Choose a hold expiry after the payment date, within 365 days.');
  if(expiresOn!==defaultExpiry&&(user.role!=='ADMIN'||!text(body.reason)))fail('An administrator and an override reason are required for a custom expiry.',403);
  const submissionHash=hash({propertyId,clientId,agentId,payment,terms,creditPolicy,expiresOn,notes:text(body.notes)});
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
    if(!body.expiresOn&&addDays(payment.paymentDate,await defaultReservationDays(session))!==expiresOn)fail('The default hold period changed. Refresh and review the new expiry.',409);
    const client=await Client.findById(clientId).session(session);
    if(!client||client.deletedAt||client.status!=='ACTIVE')fail('Choose an active client or register the prospect in Client List.',409);
    if(agentId&&!(await Agent.exists({_id:agentId,status:'ACTIVE'}).session(session)))fail('Choose an active agent.',409);
    const lot=await Property.findOneAndUpdate({_id:propertyId,status:'AVAILABLE',client:null,reservation:null,reopeningStatus:{$nin:restricted},assumptionStatus:{$ne:'PENDING'}},
      {$set:{status:'RESERVED',reservation:reservationId,hasReservationHistory:true},$inc:{__v:1}},{new:true,session});
    if(!lot||await PropertyAssignment.exists({property:propertyId,...openAccounts}).session(session))fail('This lot already has a hold, restriction, or active contract.',409);
    if(!(await Project.exists({_id:lot.project,status:{$ne:'ARCHIVED'}}).session(session)))fail('This project cannot accept reservations.',409);
    await checkReceipt(payment.receiptNumber,payment.receiptScope,reservationId,paymentId,requestId,true,false,session);
    const [record]=await Reservation.create([{_id:reservationId,property:propertyId,project:lot.project,client:clientId,agent:agentId,requestId,expiresOn,terms,creditPolicy,notes:text(body.notes),
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
async function conversionPlan(row,body,session=null) {
  if(!row.held||reservationStatus(row)!=='ACTIVE')fail('Only an active reservation can be converted. Extend an expired hold first.',409);
  if(!text(body.reason))fail('Enter the approved contract or conversion reason.');
  const lot=await Property.findOne({_id:row.property,reservation:row._id,status:'RESERVED',client:null,reopeningStatus:{$nin:restricted},assumptionStatus:{$ne:'PENDING'}}).session(session);
  if(!lot||!(await Project.exists({_id:row.project,status:{$ne:'ARCHIVED'}}).session(session)))fail('The lot or project can no longer be converted.',409);
  if(await PropertyAssignment.exists({property:lot._id,...openAccounts}).session(session))fail('This lot already has an active or protected account.',409);
  if(!(await Client.exists({_id:row.client,status:'ACTIVE',deletedAt:null}).session(session)))fail('The buyer must have an active client record.',409);
  const totalCents=moneyCents(lotPrice(lot.areaSqm,lot.pricePerSqm)),months=Number(body.months),contractDate=today(),downPaymentCents=moneyCents(body.downPayment||0);
  const firstDueDate=body.firstDueDate;
  if(!totalCents||!validDate(firstDueDate)||firstDueDate<contractDate)fail('Set a lot price and a valid first installment date on or after today.');
  const schedule=buildSchedule(totalCents,months,firstDueDate,downPaymentCents,contractDate);
  const installment=body.installment===''||body.installment==null?NaN:Number(body.installment);
  if(!Number.isInteger(installment))fail('Choose a contract installment for the reservation credit.');
  if(row.creditPolicy==='DOWN_PAYMENT'&&installment!==0||row.creditPolicy==='FIRST_INSTALLMENT'&&installment!==1)
    fail('The selected payment does not match the reservation credit terms.',409);
  const {target,additionalCents}=conversionAmounts(schedule,installment,row.payment.amountCents);
  const contract={totalCents,months,contractDate,firstDueDate,downPaymentCents,termType:'CUSTOM',schedule,areaSqm:lot.areaSqm,pricePerSqm:lot.pricePerSqm};
  const payment=additionalCents?paymentInput({...body,amount:additionalCents/100,paymentDate:contractDate}):null;
  return {contract,target,additionalCents,creditCents:row.payment.amountCents,payment,version:row.__v,lotVersion:lot.__v,reason:text(body.reason)};
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
    const reservationCredit={reservationCreditId:String(row._id),paymentId:'CREDIT-'+row.payment.paymentId,originalPaymentId:row.payment.paymentId,paymentDate:plan.contract.contractDate,
      amountCents:plan.creditCents,allocationPlan:allocation(plan.creditCents)};
    const payments=[];
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
    await PropertyAssignment.create([account],{session});
    row.status='CONVERTED';
    row.held=false;
    row.account=accountId;
    row.disposition='APPLIED';
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
  if(!['EXTEND','CORRECT','CANCEL','RELEASE','DISPOSITION'].includes(action))fail('Choose a reservation action.');
  if(body.confirmed!==true)fail('Confirm the selected reservation action.');
  return cashMutation(async session=>{
    const row=await Reservation.findById(reservationId).session(session);
    if(!row)fail('Reservation not found.',404);
    if(row.__v!==body.version)fail('The reservation changed. Refresh before retrying.',409);
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
      row.creditPolicy=body.creditPolicy;
      row.terms=text(body.terms);
      row.notes=text(body.notes);
    }
    if(action==='RELEASE'||action==='CANCEL'){
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
