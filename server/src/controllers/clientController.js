import Client from "../models/Client.js";
import { logActivity } from "../utils/activityLogger.js";

const normalize = (value) => typeof value === "string" ? value.trim() : value;

export const listClients = async (req, res, next) => {
  try {
    const clients = await Client.find().populate("createdBy", "firstName lastName username").sort({ lastName: 1, firstName: 1 });
    res.json({ success: true, data: clients });
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
    const { clientId, firstName, middleName, lastName, suffix, contactNumber, email, address, notes, status } = req.body;
    if (!clientId || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: "Client ID, first name, and last name are required." });
    }
    const client = await Client.create({
      clientId: normalize(clientId), firstName: normalize(firstName), middleName: normalize(middleName || ""),
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
    const fields = ["clientId","firstName","middleName","lastName","suffix","contactNumber","email","address","notes","status"];
    for (const field of fields) {
      if (req.body[field] !== undefined) client[field] = field === "email" ? normalize(req.body[field] || "").toLowerCase() : normalize(req.body[field]);
    }
    await client.save();
    await logActivity({ action: "CLIENT_UPDATED", req, userId: req.user._id, entityType: "Client", entityId: client._id, metadata: { clientId: client.clientId } });
    res.json({ success: true, message: "Client updated successfully.", data: client });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Client ID already exists." });
    next(error);
  }
};
