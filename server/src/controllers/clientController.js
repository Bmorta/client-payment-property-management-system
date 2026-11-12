import mongoose from "mongoose";
import Property from "../models/Property.js";
import PaymentBatch from "../models/PaymentBatch.js";
import RefundRelease from "../models/RefundRelease.js";
import CancellationCase from "../models/CancellationCase.js";
import {CLIENT_ACCOUNT_STATUSES,accountStatusTags} from "../../../shared/clientAccountStatuses.js";
import {summarizeAccount} from "../utils/accounting.js";
import PropertyAssignment from "../models/PropertyAssignment.js";
import {clientPenaltyData} from "../utils/clientPenalties.js";
import {today} from "../utils/accounting.js";
import { generateRecordId } from "../utils/generateRecordId.js";
import Client from "../models/Client.js";
import { logActivity } from "../utils/activityLogger.js";

const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
async function possibleDuplicate(data, exclude) {
  const contacts = [];
  if (normalize(data.email || "")) contacts.push({ email: new RegExp(`^${escaped(normalize(data.email))}$`, "i") });
  if (normalize(data.contactNumber || "")) contacts.push({ contactNumber: normalize(data.contactNumber) });
  if (!contacts.length) return false;
  return Client.exists({ ...(exclude ? { _id: { $ne: exclude } } : {}), firstName: new RegExp(`^${escaped(normalize(data.firstName || ""))}$`, "i"), lastName: new RegExp(`^${escaped(normalize(data.lastName || ""))}$`, "i"), $or: contacts });
}
const normalize = (value) => typeof value === "string" ? value.trim() : value;

export const listClients = async (req, res, next) => {
  try {
    const q=String(req.query.q||'').trim().slice(0,100),filter={deletedAt:null};if(req.query.deleted==='1'){if(req.user.role!=='ADMIN')return res.status(403).json({success:false,message:'Administrator access required.'});filter.deletedAt={$ne:null};}
    if(req.query.status){if(!["ACTIVE","INACTIVE"].includes(req.query.status))return res.status(400).json({success:false,message:"Choose a valid client status."});filter.status=req.query.status;}
    const statuses=req.query.accountStatuses?String(req.query.accountStatuses).split(','):[];
    if(statuses.some(v=>!CLIENT_ACCOUNT_STATUSES.some(([key])=>key===v)))return res.status(400).json({success:false,message:"Choose valid account statuses."});
    const paged=!req.listExport&&req.query.limit!==undefined,page=Math.max(1,parseInt(req.query.page)||1),limit=Math.max(1,Math.min(100,parseInt(req.query.limit)||25));
    const clients=await Client.find(filter).populate("createdBy","firstName lastName username").sort({lastName:1,firstName:1,_id:1}).lean({virtuals:true});
    const includeAccounts=!!q||statuses.length||req.listExport||req.query.penalties==='1';
    const accounts=includeAccounts?await PropertyAssignment.find({client:{$in:clients.map(c=>c._id)}}).populate('project','projectName projectId').populate('property','propertyId phaseNumber blockNumber lotNumber').lean():[];
    const grouped=new Map();for(const a of accounts){const key=String(a.client);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(a)}
    const asOf=today(),words=q.toLowerCase().split(/\s+/).filter(Boolean);let data=clients.map(c=>{
      const own=grouped.get(String(c._id))||[],details=own.map(a=>{const summary=summarizeAccount(a,asOf);return {accountId:String(a._id),assignmentId:a.assignmentId,project:a.project,property:a.property,tags:accountStatusTags(a,summary),summary}});
      const matching=details.filter(a=>!statuses.length||statuses.some(v=>a.tags.includes(v)));
      return {...c,fullName:[c.firstName,c.middleName,c.lastName,c.suffix].filter(Boolean).join(' '),matchingAccounts:matching.map(({summary,...a})=>a),accountTags:[...new Set(details.flatMap(a=>a.tags))],...(req.query.penalties==='1'?{penaltySummary:clientPenaltyData(own,asOf).summary}:{})};
    }).filter(c=>(!statuses.length||c.matchingAccounts.length)&&words.every(word=>[c.clientId,c.fullName,c.email,c.contactNumber,...c.matchingAccounts.flatMap(a=>[a.assignmentId,a.project?.projectName,a.project?.projectId,a.property?.propertyId,`Phase ${a.property?.phaseNumber} Block ${a.property?.blockNumber} Lot ${a.property?.lotNumber}`])].join(' ').toLowerCase().includes(word)));
    const total=data.length,summary={totalClients:total,activeClients:data.filter(c=>c.status==='ACTIVE').length,fullyPaidClients:data.filter(c=>c.accountTags.includes('FULLY_PAID')).length,settledClients:data.filter(c=>c.accountTags.includes('SETTLED')).length,outstandingClients:data.filter(c=>c.accountTags.includes('OUTSTANDING')).length};
    if(paged)data=data.slice((page-1)*limit,page*limit);
    res.json({success:true,data,summary,...(paged?{total,page,pageSize:limit}:{})});
  } catch (error) { next(error); }
};

export const getClient = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id).populate("createdBy", "firstName lastName username");
    if (!client || client.deletedAt) return res.status(404).json({ success: false, message: "Client not found." });
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
};

export const createClient = async (req, res, next) => {
  try {
    const { firstName, middleName, lastName, suffix, contactNumber, email, address, notes, status } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "First name and last name are required." });
    }
    if (await possibleDuplicate(req.body)) return res.status(409).json({ success: false, message: "A client with this name and contact/email already exists. Use the existing client, or restore it from Deleted Clients before assigning another property." });
    const client = await Client.create({
      clientId: await generateRecordId("client"), firstName: normalize(firstName), middleName: normalize(middleName || ""),
      lastName: normalize(lastName), suffix: normalize(suffix || ""), contactNumber: normalize(contactNumber || ""),
      email: normalize(email || "").toLowerCase(), address: normalize(address || ""), notes: normalize(notes || ""),
      status: status || "ACTIVE", createdBy: req.user._id
    });
    await logActivity({ action: "CLIENT_CREATED", req, userId: req.user._id, entityType: "Client", entityId: client._id, metadata: { clientId: client.clientId } });
    res.status(201).json({ success: true, message: "Client created successfully.", data: client });
  } catch (error) {
    if(error?.name==='VersionError')return res.status(409).json({success:false,message:'Client changed. Reload before saving again.'});
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Client ID already exists." });
    next(error);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ success: false, message: "Client not found." });
    if (req.body.status === 'INACTIVE' && await PropertyAssignment.exists({ client: client._id, $or: [{ lifecycle: 'ACTIVE' }, { lifecycle: { $exists: false } }] })) return res.status(409).json({ success: false, message: 'This client still has an active contract. Close or transfer the contract through its approved workflow before deactivating the client.' });
    if (req.body.clientId !== undefined && req.body.clientId !== client.clientId) return res.status(400).json({ success: false, message: "Client ID cannot be changed." });
    const fields = ["firstName","middleName","lastName","suffix","contactNumber","email","address","notes","status"];
    for (const field of fields) {
      if (req.body[field] !== undefined) client[field] = field === "email" ? normalize(req.body[field] || "").toLowerCase() : normalize(req.body[field]);
    }
    if (await possibleDuplicate(client, client._id)) return res.status(409).json({ success: false, message: "Another client already uses this name and contact/email." });
    await client.save();
    await logActivity({ action: "CLIENT_UPDATED", req, userId: req.user._id, entityType: "Client", entityId: client._id, metadata: { clientId: client.clientId } });
    res.json({ success: true, message: "Client updated successfully.", data: client });
  } catch (error) {
    if(error?.name==='VersionError')return res.status(409).json({success:false,message:'Client changed. Reload before saving again.'});
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Client ID already exists." });
    next(error);
  }
};

export async function changeClientDeletion(req,res,next){try{
 if(req.user.role!=='ADMIN')return res.status(403).json({success:false,message:'Administrator access required.'});
 if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({success:false,message:'Invalid client.'});
 const client=await Client.findById(req.params.id).lean();if(!client)return res.status(404).json({success:false,message:'Client not found.'});
 const restore=req.method==='POST',reason=String(req.body.reason||'').trim();
 if(req.body.confirm!==true||req.body.expectedVersion!==(client.__v||0)||reason.length<5||reason.length>500)return res.status(409).json({success:false,message:'Enter a reason and confirm the current client version.'});
 if(restore?!client.deletedAt:!!client.deletedAt)return res.status(409).json({success:false,message:'Client status changed. Refresh the list.'});
 if(!restore){const links=await Promise.all([PropertyAssignment.exists({client:client._id}),Property.exists({client:client._id}),PaymentBatch.exists({client:client._id}),RefundRelease.exists({client:client._id}),CancellationCase.exists({client:client._id})]);if(links.some(Boolean))return res.status(409).json({success:false,message:'This client has linked properties, contracts or financial history. Use Deactivate; deletion cannot remove those records.'});}
 const event={action:restore?'CLIENT_RESTORED':'CLIENT_DELETED',reason,userId:req.user._id,username:req.user.username,timestamp:new Date()},values=restore?{status:client.statusBeforeDeletion||'INACTIVE',deletedAt:null,deletedBy:null,deletionReason:''}:{status:'INACTIVE',statusBeforeDeletion:client.status,deletedAt:event.timestamp,deletedBy:req.user._id,deletionReason:reason};
 const saved=await Client.findOneAndUpdate({_id:client._id,__v:client.__v||0,deletedAt:restore?{$ne:null}:null},{$set:values,$inc:{__v:1},$push:{deletionHistory:event}},{new:true,runValidators:true}).lean();if(!saved)return res.status(409).json({success:false,message:'Client changed. Refresh before retrying.'});
 res.json({success:true,data:saved,message:restore?'Client restored with the same Client ID.':'Client moved to Deleted Clients. An administrator can restore it.'});
 }catch(e){next(e)}}
