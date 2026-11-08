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
    const q=String(req.query.q||'').trim().slice(0,100),filter=q?{$and:q.split(/\s+/).map(word=>({$or:['clientId','firstName','middleName','lastName','suffix','email','contactNumber'].map(k=>({[k]:new RegExp(escaped(word),'i')}))}))}:{};
    const paged=req.query.limit!==undefined,page=Math.max(1,parseInt(req.query.page)||1),limit=Math.max(1,Math.min(100,parseInt(req.query.limit)||25));
    let query=Client.find(filter).populate("createdBy", "firstName lastName username").sort({lastName:1,firstName:1,_id:1});if(paged)query=query.skip((page-1)*limit).limit(limit);const clients=await query;
    let data=clients;if(req.query.penalties==='1'){const accounts=await PropertyAssignment.find({client:{$in:clients.map(c=>c._id)}}).lean(),grouped=new Map();for(const a of accounts){const key=String(a.client);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(a)}const asOf=today();data=clients.map(c=>({...c.toObject({virtuals:true}),penaltySummary:clientPenaltyData(grouped.get(String(c._id))||[],asOf).summary}))}
    res.json({success:true,data,...(paged?{total:await Client.countDocuments(filter),page,pageSize:limit}:{})});
  } catch (error) { next(error); }
};

export const getClient = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id).populate("createdBy", "firstName lastName username");
    if (!client) return res.status(404).json({ success: false, message: "Client not found." });
    res.json({ success: true, data: client });
  } catch (error) { next(error); }
};

export const createClient = async (req, res, next) => {
  try {
    const { firstName, middleName, lastName, suffix, contactNumber, email, address, notes, status } = req.body;
    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: "First name and last name are required." });
    }
    if (await possibleDuplicate(req.body)) return res.status(409).json({ success: false, message: "A client with this name and contact/email already exists. Use the existing client and assign another property." });
    const client = await Client.create({
      clientId: await generateRecordId("client"), firstName: normalize(firstName), middleName: normalize(middleName || ""),
      lastName: normalize(lastName), suffix: normalize(suffix || ""), contactNumber: normalize(contactNumber || ""),
      email: normalize(email || "").toLowerCase(), address: normalize(address || ""), notes: normalize(notes || ""),
      status: status || "ACTIVE", createdBy: req.user._id
    });
    await logActivity({ action: "CLIENT_CREATED", req, userId: req.user._id, entityType: "Client", entityId: client._id, metadata: { clientId: client.clientId } });
    res.status(201).json({ success: true, message: "Client created successfully.", data: client });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Client ID already exists." });
    next(error);
  }
};

export const updateClient = async (req, res, next) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ success: false, message: "Client not found." });
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
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Client ID already exists." });
    next(error);
  }
};
