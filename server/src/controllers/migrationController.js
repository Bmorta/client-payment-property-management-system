import {simpleMigrationReview} from "../services/simpleMigration.js";
import {createRestorePoint} from "../services/restorePoint.js";
import {calculateCommissions} from '../utils/commissionLedger.js';
import {allocatePayments} from '../utils/paymentLedger.js';
import {historicalFingerprint} from '../utils/commissionReconciliation.js';
import {reportIdentity,brandExcel} from "../services/companyBranding.js";
import mongoose from 'mongoose';
import {randomUUID,createHash} from 'node:crypto';
import ExcelJS from 'exceljs';
import MigrationBatch from '../models/MigrationBatch.js';
import MigrationConfig from '../models/MigrationConfig.js';
import MigrationDocument from '../models/MigrationDocument.js';
import PropertyAssignment from '../models/PropertyAssignment.js';
import User from '../models/User.js';
import ReceiptClaim from '../models/ReceiptClaim.js';
import {today,validDate,moneyCents} from '../utils/accounting.js';
import {clean,fail,hash,assertVersion,normalizeMigrationRow,migrationStats,migrationContext} from '../utils/migrationRules.js';
import {actor,duplicates,newRow,validateBatch,payoutRows} from '../services/migrationService.js';
import {calendarDay} from '../utils/contractMonitoring.js';
import {monitoringMutation} from '../services/monitoringService.js';
const id=v=>{if(typeof v!=='string'||!mongoose.isValidObjectId(v))fail('Invalid identifier.');return v};
const load=async req=>{const b=await MigrationBatch.findById(id(req.params.id)).lean();if(!b)fail('Migration account not found.',404);return migrationContext(b,await MigrationConfig.findById('OFFICE').lean())};
const account=async value=>{const a=await PropertyAssignment.findById(value).populate('client','clientId firstName middleName lastName').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').lean();if(!a)fail('Linked contract no longer exists.',409);if(['TRANSFERRED','CANCELLED'].includes(a.lifecycle)||a.pendingCancellation||a.creditAmendments?.length||a.transferIn)fail('Lot-transfer contracts cannot be replaced by historical migration. Review transfer history.',409);return a};
const canEdit=(b,user)=>{if(user.role!=='ADMIN'&&String(b.encoder)!==String(user._id))fail('Only the assigned encoder or an administrator may edit this migration.',403);if(!['NOT_STARTED','IN_PROGRESS','NEEDS_CORRECTION'].includes(b.status))fail('Return this record for correction before editing.',409)};
async function save(b,req,set,event,details={}){const updated=await MigrationBatch.findOneAndUpdate({_id:b._id,__v:b.__v},{$set:set,$inc:{__v:1},$push:{history:{...actor(req.user),event,...details}}},{new:true,runValidators:true}).lean();if(!updated)fail('Another user changed this migration. Refresh and retry.',409);return updated;}
const reply=(res,data,message)=>res.json({success:true,data,message});
export async function getConfig(req,res,next){try{const config=await MigrationConfig.findById('OFFICE').lean(),staff=await User.find({isActive:true,role:{$in:['ADMIN','STAFF']}}).select('username firstName lastName role').lean();reply(res,{config,staff,preparationMode:!validDate(config?.cutoffDate)})}catch(e){next(e)}}
export async function setConfig(req,res,next){try{
 const cutoffInput=clean(req.body.cutoffDate,100);if(cutoffInput.length>10)fail('Cutoff must be a calendar date in YYYY-MM-DD format.');const cutoffDate=cutoffInput||null;if(cutoffDate&&(!validDate(cutoffDate)||cutoffDate>=today()))fail('Cutoff must be a valid date before today.');
 const existing=await MigrationConfig.findById('OFFICE').lean();if(existing&&existing.cutoffDate&&existing.cutoffDate!==cutoffDate&&(existing.stagingStarted||await MigrationBatch.exists({})))fail('Cutoff is locked after staging begins. Administrator-led migration recovery is required to change it.',409);
 if(existing&&req.body.version!==existing.__v)fail('Configuration changed. Refresh first.',409);
 const backupReference=clean(req.body.backupReference,200),recoveryTestReference=clean(req.body.recoveryTestReference,200),reason=clean(req.body.reason)||'Administrator updated migration settings';
 let result;if(existing)result=await MigrationConfig.findOneAndUpdate({_id:'OFFICE',__v:existing.__v,...(existing.cutoffDate!==cutoffDate?{stagingStarted:{$ne:true}}:{})},{$set:{cutoffDate,backupReference,recoveryTestReference},$inc:{__v:1},$push:{history:{...actor(req.user),event:'CONFIG_UPDATED',previousValues:{cutoffDate:existing.cutoffDate,backupReference:existing.backupReference,recoveryTestReference:existing.recoveryTestReference},reason}}},{new:true}).lean();else result=await MigrationConfig.create({_id:'OFFICE',cutoffDate,backupReference,recoveryTestReference,history:[{...actor(req.user),event:'CONFIG_CREATED',reason}]});
 if(!result)fail('Configuration changed. Refresh.',409);reply(res,result,'Cutoff configuration saved.');
}catch(e){next(e)}}
export async function dashboard(req,res,next){try{
 const all=await MigrationBatch.find().select('-history -imports').lean(),count=await PropertyAssignment.countDocuments();
 for(const field of ['from','to'])if(req.query[field]&&!validDate(req.query[field]))fail('Choose valid encoding dates.');if(req.query.from&&req.query.to&&req.query.from>req.query.to)fail('Encoding start date must precede end date.');
 const q=clean(req.query.q,100).toLowerCase();let rows=[];
 // Account inventory includes contracts with no migration batch yet.
 const accounts=await PropertyAssignment.find().populate('client','clientId firstName middleName lastName').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').select('assignmentId client project property contract.months').lean();
 for(const a of accounts){const b=all.find(b=>String(b.account)===String(a._id)),r={...a,batch:b?{_id:b._id,batchId:b.batchId,status:b.status,encoder:b.encoder,verifier:b.verifier,updatedAt:b.updatedAt,rows:b.rows.length,paymentCount:b.rows.filter(r=>r.kind==='PAYMENT'&&!r.excluded).length,reconciliation:b.reconciliation}:null,status:b?.status||'NOT_STARTED'};const text=[a.assignmentId,a.client?.clientId,a.client?.firstName,a.client?.lastName,a.project?.projectName,a.property?.propertyId,`Phase ${a.property?.phaseNumber} Block ${a.property?.blockNumber} Lot ${a.property?.lotNumber}`].join(' ').toLowerCase();const encodedDates=(b?.rows||[]).map(r=>calendarDay(r.encodedAt));if(!text.includes(q)||req.query.status&&r.status!==req.query.status||req.query.project&&String(a.project?._id)!==req.query.project||req.query.encoder&&String(b?.encoder)!==req.query.encoder||['phase','block','lot'].some(k=>req.query[k]&&String(a.property?.[k+'Number'])!==req.query[k])||(req.query.from||req.query.to)&&!encodedDates.some(d=>(!req.query.from||d>=req.query.from)&&(!req.query.to||d<=req.query.to)))continue;rows.push(r)}
 rows.sort((a,b)=>String(b.batch?.updatedAt||'').localeCompare(String(a.batch?.updatedAt||''))||a.assignmentId.localeCompare(b.assignmentId));
 const brand=await reportIdentity(req.query.project||rows.map(r=>r.project?._id).filter(Boolean)),snapshot=hash({rows,companyIdentity:brand.companyIdentity});if(req.query.expectedSnapshot&&req.query.expectedSnapshot!==snapshot)fail('Migration progress changed. Refresh the preview before exporting.',409);
 if(req.query.format==='xlsx'){const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Migration Progress');sheet.addRow([brand.companyName,'Historical Data Migration',today()]);sheet.addRow(['Filters',JSON.stringify(req.query)]);sheet.addRow(['Contract','Client ID','Client','Project','Phase','Block','Lot','Migration Status','Encoded Payments','Encoder','Last Updated']);for(const r of rows)sheet.addRow([r.assignmentId,r.client?.clientId,[r.client?.firstName,r.client?.lastName].join(' '),r.project?.projectName,r.property?.phaseNumber,r.property?.blockNumber,r.property?.lotNumber,r.status,r.batch?.paymentCount||0,String(r.batch?.encoder||''),r.batch?.updatedAt?.toISOString()||'']);brandExcel(book,sheet,brand);sheet.columns.forEach(c=>c.width=24);sheet.getRow(3).font={bold:true};res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('migration-progress.xlsx').send(Buffer.from(await book.xlsx.writeBuffer()));return}
 const page=Number(req.query.page||1);if(!Number.isSafeInteger(page)||page<1)fail('Invalid page.');reply(res,{brand,snapshot,stats:migrationStats(all,count),rows:req.query.all==='1'?rows:rows.slice((page-1)*20,page*20),count:rows.length,page});
}catch(e){next(e)}}
export async function createBatch(req,res,next){try{
 const config=await MigrationConfig.findById('OFFICE').lean();
 const a=await account(id(req.body.accountId));const existing=await MigrationBatch.findOne({account:a._id}).lean();if(existing)return reply(res,existing,'Existing migration opened.');
 const encoder=req.user.role==='ADMIN'&&req.body.encoder?id(req.body.encoder):req.user._id;
 if(!await User.exists({_id:encoder,isActive:true,role:{$in:['ADMIN','STAFF']}}))fail('Choose an active encoder.');
 if(config?.cutoffDate){const frozen=await MigrationConfig.updateOne({_id:'OFFICE',__v:config.__v,cutoffDate:config.cutoffDate},{$set:{stagingStarted:true}});if(frozen.matchedCount!==1)fail('Cutoff configuration changed. Refresh before starting migration.',409);}
 const result=await MigrationBatch.create({batchId:`MIG-${randomUUID()}`,account:a._id,cutoffDate:config?.cutoffDate||null,encoder,createdBy:req.user._id,history:[{...actor(req.user),event:'MIGRATION_STARTED'}]});reply(res,result,'Migration staging opened. No live records changed.');
}catch(e){if(e.code===11000)e=Object.assign(new Error('Migration already started. Refresh the dashboard.'),{statusCode:409});next(e)}}
export async function getBatch(req,res,next){try{const b=await load(req),a=await account(b.account),documents=await MigrationDocument.find({batch:b._id}).select('-data').lean();reply(res,{...b,account:a,documents})}catch(e){next(e)}}
export async function editBatch(req,res,next){try{
 const b=await load(req);assertVersion(b,req.body.version);canEdit(b,req.user);const a=await account(b.account),action=req.body.action;let set={status:'IN_PROGRESS'},details={};
 if(action==='ASSIGN'){
  if(req.user.role!=='ADMIN')fail('Administrator assignment required.',403);
  for(const field of ['encoder','verifier']){const value=id(req.body[field]);if(!await User.exists({_id:value,isActive:true,role:{$in:field==='verifier'?['ADMIN']:['ADMIN','STAFF']}}))fail('Choose active staff.');set[field]=value}
 }else if(action==='RECONCILE'){
  const source=req.body.reconciliation||{};set.reconciliation={officeBalanceCents:moneyCents(source.officeBalance),officePenaltyCents:moneyCents(source.officePenalty),historicalStatus:clean(source.historicalStatus,30),expectedPeriods:Number(source.expectedPeriods),documentReference:clean(source.documentReference,200),commissionReview:clean(source.commissionReview,30),notes:clean(source.notes)};details={previousValues:b.reconciliation,updatedValues:set.reconciliation};
 }else if(action==='UPSERT_ROW'){
  const normalized=normalizeMigrationRow(req.body.row,b.cutoffDate,a),old=b.rows.find(r=>r.rowId===req.body.rowId);if(req.body.rowId&&!old)fail('Draft row not found.',404);
  if(!old&&b.rows.length>=500)fail('This account batch supports up to 500 rows. Contact the administrator for larger historical ledgers.');
  const row=old?{...old,...newRow(normalized,req.user,old.source),duplicateReview:null,rowId:old.rowId,encodedAt:old.encodedAt,encodedBy:old.encodedBy,encoderUsername:old.encoderUsername,modifiedAt:new Date(),modifiedBy:String(req.user._id)}:newRow(normalized,req.user);
  if(b.rows.some(r=>r.rowId!==row.rowId&&r.fingerprint===row.fingerprint))fail('Identical draft already exists. Review it instead of entering it twice.',409);
  set.rows=old?b.rows.map(r=>r.rowId===old.rowId?row:r):[...b.rows,row];details={rowId:row.rowId,previousValues:old||null,updatedValues:row};
 }else if(action==='DELETE_ROW'||action==='EXCLUDE_ROW'){
  const r=b.rows.find(r=>r.rowId===req.body.rowId);if(!r)fail('Draft row not found.',404);const reason=clean(req.body.reason)||'Draft corrected by encoder';
  set.rows=action==='DELETE_ROW'?b.rows.filter(x=>x.rowId!==r.rowId):b.rows.map(x=>x.rowId===r.rowId?{...x,excluded:!x.excluded,exclusionReason:reason,modifiedAt:new Date(),modifiedBy:String(req.user._id)}:x);details={previousValues:r,reason};
 }else if(action==='RESOLVE_DUPLICATE'){
  if(req.user.role!=='ADMIN')fail('Administrator duplicate review required.',403);const reason=clean(req.body.reason);if(!reason)fail('Document why this is a distinct original transaction.');const r=b.rows.find(r=>r.rowId===req.body.rowId);if(!r)fail('Row not found.');const hits=await duplicates(r,a._id,b._id);for(const other of b.rows.filter(x=>x.rowId!==r.rowId&&!x.excluded)){const {possibleDuplicate}=await import('../utils/migrationRules.js');const kind=possibleDuplicate(r,other);if(kind)hits.push({kind,source:'BATCH',reference:other.rowId})}if(hits.some(h=>h.kind==='RECEIPT_SERIES'))fail('A reused receipt/series cannot be overridden. Correct the source or exclude the duplicate.',409);set.rows=b.rows.map(x=>x.rowId===r.rowId?{...x,duplicateReview:{...actor(req.user),reason,signature:hash(hits.sort((a,b)=>a.reference.localeCompare(b.reference)||a.kind.localeCompare(b.kind)))}}:x);details={rowId:r.rowId,reason,hits};
 }else fail('Unknown migration action.');
 reply(res,await save(b,req,set,action,details),'Staging saved. Live totals are unchanged.');
}catch(e){next(e)}}
export async function preview(req,res,next){try{const b=await load(req),a=await account(b.account);reply(res,(await validateBatch(b,a)).preview)}catch(e){next(e)}}
export async function workflow(req,res,next){try{
 let b=await load(req);const action=req.body.action,simple=action==='APPROVE_IMPORT';
 if(simple&&req.user.role!=='ADMIN')fail('Only an administrator can approve historical imports.',403);
 if(simple&&b.status==='COMPLETED')return reply(res,b,'Already imported. No duplicate posting.');
 if(simple){const reviewed=await simpleMigrationReview(b,await account(b.account),await MigrationConfig.findById('OFFICE').lean());if(reviewed.preview.errors.length)fail(reviewed.preview.errors.join(' '),409);if(req.body.token!==reviewed.preview.token||req.body.confirm!==true)fail('Review the final summary and confirm the import.',409);b={...reviewed.batch,review:{accountVersion:reviewed.preview.accountVersion}}}
 if(action==='ACTIVATE'&&req.user.role!=='ADMIN')fail('Administrator activation required.',403);
 if(action==='ACTIVATE'&&b.status==='COMPLETED')return reply(res,b,'Already activated; no duplicate posting.');
 assertVersion(b,req.body.version);const reason=clean(req.body.reason);if(['RETURN','REJECT'].includes(action)&&!reason)fail('A reason is required when returning or rejecting records.');
 if(action==='RETURN'||action==='REJECT'){
  if(req.user.role!=='ADMIN')fail('Administrator review required.',403);return reply(res,await save(b,req,{status:'NEEDS_CORRECTION',review:null},action,{reason}),'Returned for correction.');
 }
 if(action==='SUBMIT'){
  canEdit(b,req.user);const a=await account(b.account),{preview:p}=await validateBatch(b,a);if(p.errors.length)fail(p.errors.join(' '),409);return reply(res,await save(b,req,{status:'PENDING_VERIFICATION',review:null},'SUBMITTED',{reason,token:p.token}),'Submitted for verification.');
 }
 if(!['VERIFY','ACTIVATE','APPROVE_IMPORT'].includes(action))fail('Choose a workflow action.');if(req.user.role!=='ADMIN')fail('Only an administrator may verify or activate historical financial records.',403);
 const available=await User.exists({_id:{$ne:req.user._id},isActive:true,role:'ADMIN'}),encodedBySelf=b.rows.some(r=>String(r.encodedBy)===String(req.user._id)||String(r.modifiedBy)===String(req.user._id));
 if(!simple&&encodedBySelf&&available)fail('Another active administrator must approve records you encoded.',403);
 if(!simple&&encodedBySelf&&!clean(req.body.soleAdminReason))fail('A sole-administrator self-review exception requires an explicit reason.');
 if(!simple&&b.verifier&&String(b.verifier)!==String(req.user._id))fail('This account is assigned to a different verifier.',403);
 if(action==='VERIFY'){
  if(b.status!=='PENDING_VERIFICATION')fail('Submit this account for verification first.',409);
  const a=await account(b.account),{preview:p}=await validateBatch(b,a);if(p.errors.length)fail(p.errors.join(' '),409);
  if(req.body.token!==p.token)fail('Reconciliation changed. Refresh and review the allocation preview.',409);
  return reply(res,await save(b,req,{status:'VERIFIED',review:{...actor(req.user),token:p.token,accountVersion:p.accountVersion,cutoffDate:b.cutoffDate||null,preparationMode:b.preparationMode,reason,soleAdminReason:clean(req.body.soleAdminReason)}},'VERIFIED',{reason,cutoffDate:b.cutoffDate||null,preparationMode:b.preparationMode}),'Verified; not yet posted.');
 }
 if(!simple&&(b.status!=='VERIFIED'||req.body.confirm!==true))fail('Verify the account and explicitly confirm activation.',409);
 const config=await MigrationConfig.findById('OFFICE').lean();if(!simple&&!validDate(config?.cutoffDate))fail('Preparation Mode: configure the official migration cutoff before financial activation.',409);
 if(!simple&&(!b.review||b.cutoffDate!==config.cutoffDate||(b.review.cutoffDate??b.cutoffDateSnapshot)!==config.cutoffDate||b.review.preparationMode))fail('The official cutoff requires a fresh reconciliation and administrator verification. Return this preparation review for correction and verify again.',409);
 if(!simple&&(!config?.backupReference||!config?.recoveryTestReference))fail('An administrator must record a verified backup and staging recovery-test reference before activation.',409);
 // Multi-document financial posting fails closed on standalone MongoDB. No
 // financial writes occur outside this transaction; retries preserve source IDs.
 const hello=await mongoose.connection.db.admin().command({hello:1});if(simple&&!hello.setName&&hello.msg!=='isdbgrid')fail('Safe import needs transaction support. Ask the administrator to enable a MongoDB replica set; your drafts remain saved.',409);
 const backupCollections=simple?await mongoose.connection.db.listCollections({},{nameOnly:true}).toArray().then(r=>r.map(x=>x.name).filter(n=>!n.startsWith('system.'))):[];let restorePoint;const session=await mongoose.startSession();let activated;
 try{await session.withTransaction(async()=>{
  const stored=await MigrationBatch.findById(b._id).session(session).lean();let current=migrationContext(stored,config);if(current.status==='COMPLETED'){activated=current;return}if(current.__v!==b.__v)fail('Migration changed. Refresh.',409);
  const a=await PropertyAssignment.findById(current.account).populate('client','clientId firstName middleName lastName').populate('project','projectId projectName').populate('property','propertyId phaseNumber blockNumber lotNumber').session(session).lean();
  if(['TRANSFERRED','CANCELLED'].includes(a?.lifecycle)||a?.pendingCancellation||a?.creditAmendments?.length||a?.transferIn)fail('Transfer contracts cannot receive migration activation.',409);
  if(a.migration)fail('This account already has activated historical records.',409);
  let checked;if(simple){checked=await simpleMigrationReview(current,a,config,session);current={...checked.batch,review:{accountVersion:checked.preview.accountVersion}}}else checked=await validateBatch(current,a,session);const {preview:p,result}=checked;if(p.errors.length)fail(p.errors.join(' '),409);
  if(a.__v!==current.review.accountVersion)fail('Live account changed since verification. Return and reconcile again.',409);
  if(req.body.token!==p.token)fail('Preview changed. Refresh reconciliation before activating.',409);
  if(simple)restorePoint=await createRestorePoint({session,collections:backupCollections,label:'historical-import'});
  const lockedConfig=simple?{matchedCount:1}:await MigrationConfig.updateOne({_id:'OFFICE',__v:config.__v,cutoffDate:current.cutoffDate},{$inc:{activationSequence:1}},{session});if(lockedConfig.matchedCount!==1)fail('Migration configuration changed. Review again.',409);
  for(const row of current.rows.filter(r=>r.kind==='PAYMENT'&&!r.excluded)){
   const key=createHash('sha256').update(JSON.stringify([row.series,row.receiptNumber.toUpperCase()])).digest('hex');
   await ReceiptClaim.create([{_id:key,scope:row.series,receiptNumber:row.receiptNumber,accountId:a._id,paymentId:`HIS-${row.rowId}`,requestId:`migration-${row.rowId}`}],{session});
  }
  const payouts=payoutRows(current,req.user).map(payout=>{const record=p.commissions.find(c=>c.commissionId===payout.commissionId);return {...payout,agent:record.agent,agentId:record.agentId,type:record.type,period:record.period,earnedCentsAtRelease:record.earnedCents}}),proposed={...result.proposed,commissionPayouts:[...(a.commissionPayouts||[]),...payouts]};
  const verifiedCommissionRecords=calculateCommissions(proposed,allocatePayments(proposed)).records;
  proposed.commissionHistoricalReviews=[...(a.commissionHistoricalReviews||[]),...p.commissions.filter(c=>current.rows.some(r=>!r.excluded&&r.kind==='COMMISSION'&&r.commissionId===c.commissionId)).map(c=>({commissionId:c.commissionId,fingerprint:historicalFingerprint(verifiedCommissionRecords.find(r=>r.commissionId===c.commissionId)||c,proposed.commissionAgreement),disposition:'MIGRATION_RECONCILED',documentReference:current.reconciliation.documentReference,migrationBatchId:current.batchId,...actor(req.user),reason:'Verified period-by-period historical commission reconciliation'}))];
  const mutation=monitoringMutation(proposed,actor(req.user),'Verified historical migration activation');
  const set={commissionHistoricalReviews:proposed.commissionHistoricalReviews,migration:{...proposed.migration,historicalStatus:current.reconciliation.historicalStatus,approvedBy:String(req.user._id)},historicalPenalties:proposed.historicalPenalties,penaltyWaivers:proposed.penaltyWaivers,...(mutation.update?.$set||{})};
  // Old payment arrays are never overwritten. Appends and derived allocations,
  // penalties, commissions and the account audit outbox commit together.
  const push={...(mutation.update?.$push||{}),payments:{$each:result.payments},commissionPayouts:{$each:payouts}};
  const event={...actor(req.user),action:'HISTORICAL_MIGRATION_ACTIVATED',batchId:current.batchId,reason,sourceRows:current.rows.filter(r=>!r.excluded).map(r=>r.rowId)};
  push.auditEvents={$each:[...(push.auditEvents?.$each||[push.auditEvents].filter(Boolean)),event]};
  const updated=await PropertyAssignment.updateOne({_id:a._id,__v:a.__v??0,migration:{$exists:false}},{$set:set,$push:push,$inc:{__v:1}},{session,runValidators:true});if(updated.modifiedCount!==1)fail('Live account changed. Reconcile again.',409);
  activated=await MigrationBatch.findOneAndUpdate({_id:current._id,__v:current.__v},{$set:{status:'COMPLETED',...(simple?{reconciliation:current.reconciliation,review:{...actor(req.user),token:p.token,cutoffDate:current.cutoffDate,simpleApproval:true}}:{}),activation:{...actor(req.user),reason,restorePointId:restorePoint?.id,cutoffDate:current.cutoffDate,simpleApproval:simple,approvalSummary:{paymentCount:p.paymentCount,totalPaymentCents:p.totalPaymentCents,principalCents:p.expectedBalanceCents,penaltyCents:p.recordedPenaltyCents},accountVersion:(a.__v??0)+1,paymentIds:result.payments.map(p=>p.paymentId),payoutIds:payouts.map(p=>p.payoutId)}},$inc:{__v:1},$push:{history:{...actor(req.user),event:'ACTIVATED',reason}}},{session,new:true}).lean();
 });}catch(e){if(e.code===20||/Transaction numbers|replica set|mongos/i.test(e.message))fail('Activation requires a MongoDB replica set for atomic financial posting. Staging remains safe; ask the administrator to configure and test a replica set.',409);if(e.code===11000)fail('A receipt or transaction was already claimed. Reconcile the duplicate; nothing was partially activated.',409);throw e}finally{await session.endSession()}
 reply(res,activated,'Historical records activated in their original financial periods.');
}catch(e){next(e)}}
export async function addDocument(req,res,next){try{
 const b=await load(req);assertVersion(b,req.body.version);canEdit(b,req.user);
 const mime=clean(req.body.mime,80),bytes=Buffer.from(String(req.body.base64||''),'base64');if(bytes.length<4||bytes.length>2*1024*1024)fail('Documents must be no larger than 2 MB.');
 const magic=mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:false;if(!magic)fail('Upload a valid PDF, PNG or JPEG.');
 const rowId=clean(req.body.rowId,80);if(rowId&&!b.rows.some(r=>r.rowId===rowId))fail('Document row does not belong to this account.');
 if(await MigrationDocument.countDocuments({batch:b._id,deleted:false})>=30)fail('Maximum 30 active documents per account.');
 const documentId=new mongoose.Types.ObjectId();await save(b,req,{},'DOCUMENT_ATTACHMENT_PENDING',{documentId,sha256:hash(bytes)});
 const doc=await MigrationDocument.create({_id:documentId,batch:b._id,rowId,name:clean(req.body.name,120),mime,sha256:hash(bytes),data:bytes,createdBy:req.user._id,history:[{...actor(req.user),event:'UPLOADED'}]});
 reply(res,{_id:doc._id,name:doc.name,mime},'Supporting evidence added; it is not automatically verified.');
}catch(e){next(e)}}
export async function document(req,res,next){try{
 const b=await load(req),d=await MigrationDocument.findOne({_id:id(req.params.documentId),batch:b._id,deleted:false}).select('+data').lean();if(!d)fail('Document not found.',404);
 res.set({'Content-Type':d.mime,'Content-Disposition':'inline; filename="historical-evidence"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).send(d.data.buffer?Buffer.from(d.data.buffer):d.data);
}catch(e){next(e)}}
export async function removeDocument(req,res,next){try{const b=await load(req);assertVersion(b,req.body.version);canEdit(b,req.user);const reason=clean(req.body.reason);if(!reason)fail('Document removal reason is required.');await save(b,req,{},'DOCUMENT_REMOVAL_REQUESTED',{documentId:req.params.documentId,reason});const d=await MigrationDocument.findOneAndUpdate({_id:id(req.params.documentId),batch:b._id,deleted:false},{$set:{deleted:true},$unset:{data:1},$push:{history:{...actor(req.user),event:'REMOVED',reason}}},{new:true});if(!d)fail('Document not found.',404);reply(res,null,'Evidence removed; metadata and audit history retained.')}catch(e){next(e)}}

export async function simplePreview(req,res,next){try{const b=await load(req),a=await account(b.account),r=await simpleMigrationReview(b,a,await MigrationConfig.findById('OFFICE').lean());reply(res,r.preview)}catch(e){next(e)}}
