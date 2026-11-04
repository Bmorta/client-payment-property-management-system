import mongoose from "mongoose";
import Project from "../models/Project.js";
import Property from "../models/Property.js";
import { generateRecordId } from "../utils/generateRecordId.js";

const validPositiveInteger = (n) => Number.isSafeInteger(n) && n > 0;

export async function listProjectProperties(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });

    const properties = await Property.find({ project: project._id })
      .sort({ phaseNumber: 1, blockNumber: 1, lotNumber: 1 });
    res.json({ success: true, data: properties });
  } catch (error) {
    next(error);
  }
}

export async function createProjectProperty(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    if (project.status === "ARCHIVED") {
      return res.status(409).json({ success: false, message: "Cannot add lots to an archived project." });
    }

    const { phaseNumber, blockNumber, lotNumber, areaSqm } = req.body;
    if (![phaseNumber, blockNumber, lotNumber].every(validPositiveInteger)) {
      return res.status(400).json({ success: false, message: "Phase, block and lot numbers must be positive integers." });
    }
    if (areaSqm !== null && areaSqm !== undefined &&
      (typeof areaSqm !== "number" || !Number.isFinite(areaSqm) || areaSqm <= 0)) {
      return res.status(400).json({ success: false, message: "Lot area must be a positive number, or left unspecified." });
    }

    const location = { project: project._id, phaseNumber, blockNumber, lotNumber };
    if (await Property.exists(location)) {
      return res.status(409).json({ success: false, message: "This phase, block and lot already exists in the project." });
    }

    const propertyId = await generateRecordId("property");
    const property = await Property.create({
      ...location, propertyId, areaSqm: areaSqm ?? null, createdBy: req.user._id
    });
    res.status(201).json({ success: true, data: property, message: "Property created." });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Duplicate property ID or location." });
    }
    next(error);
  }
}

export async function updateProjectPropertyArea(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId) || !mongoose.isValidObjectId(req.params.propertyId)) {
      return res.status(400).json({ success: false, message: "Invalid identifier." });
    }
    const { areaSqm } = req.body;
    if (typeof areaSqm !== "number" || !Number.isFinite(areaSqm) || areaSqm <= 0) {
      return res.status(400).json({ success: false, message: "Lot area must be a positive number." });
    }
    const property = await Property.findOneAndUpdate(
      { _id: req.params.propertyId, project: req.params.projectId },
      { $set: { areaSqm } }, { new: true, runValidators: true }
    );
    if (!property) return res.status(404).json({ success: false, message: "Property not found." });
    res.json({ success: true, data: property, message: "Lot area updated." });
  } catch (error) {
    next(error);
  }
}
