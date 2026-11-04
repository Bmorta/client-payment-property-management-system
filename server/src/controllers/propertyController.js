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

/**
 * Generate lots from an explicit per-phase/per-block configuration.
 * Example: { phases: [{ phaseNumber: 1, blocks: [
 *   { blockNumber: 1, lotCount: 2, areasSqm: [120, 135] }
 * ] }] }
 * Each lot receives an independent area and immutable property ID.
 */
export async function generateProjectProperties(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    if (project.status === "ARCHIVED") {
      return res.status(409).json({ success: false, message: "Cannot add lots to an archived project." });
    }

    const phases = req.body?.phases;
    if (!Array.isArray(phases) || phases.length === 0) {
      return res.status(400).json({ success: false, message: "Provide at least one phase." });
    }

    const locations = [];
    const seen = new Set();
    for (const phase of phases) {
      if (!validPositiveInteger(phase?.phaseNumber) || !Array.isArray(phase.blocks) || !phase.blocks.length) {
        return res.status(400).json({ success: false, message: "Each phase requires a positive phase number and at least one block." });
      }
      for (const block of phase.blocks) {
        if (!validPositiveInteger(block?.blockNumber) || !validPositiveInteger(block?.lotCount)) {
          return res.status(400).json({ success: false, message: "Each block needs a positive block number and lot count." });
        }
        if (block.lotCount > 100 || locations.length + block.lotCount > 100) {
          return res.status(400).json({ success: false, message: "Generate no more than 100 lots per request." });
        }
        const areas = block.areasSqm;
        if (areas !== undefined && (!Array.isArray(areas) || areas.length !== block.lotCount)) {
          return res.status(400).json({ success: false, message: "areasSqm must have one entry per lot." });
        }
        for (let i = 0; i < block.lotCount; i++) {
          const areaSqm = areas?.[i] ?? null;
          if (areaSqm !== null && (typeof areaSqm !== "number" || !Number.isFinite(areaSqm) || areaSqm <= 0)) {
            return res.status(400).json({ success: false, message: "Each supplied lot area must be a positive number." });
          }
          const lotNumber = i + 1;
          const key = `${phase.phaseNumber}/${block.blockNumber}/${lotNumber}`;
          if (seen.has(key)) {
            return res.status(400).json({ success: false, message: "Duplicate phase/block/lot in request." });
          }
          seen.add(key);
          locations.push({ phaseNumber: phase.phaseNumber, blockNumber: block.blockNumber, lotNumber, areaSqm });
        }
      }
    }

    const existing = await Property.findOne({
      project: project._id,
      $or: locations.map(({ phaseNumber, blockNumber, lotNumber }) => ({ phaseNumber, blockNumber, lotNumber }))
    }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Some lots already exist. No lots were generated; choose a new phase/block or edit existing lots."
      });
    }

    // Allocate IDs first; sequence gaps are acceptable if insertion later fails.
    const documents = [];
    for (const location of locations) {
      documents.push({
        ...location,
        project: project._id,
        propertyId: await generateRecordId("property"),
        createdBy: req.user._id
      });
    }
    // Unordered insertion may leave partial records after a race or database error.
    // Ordered insertion stops on the first failure; callers must inspect inventory
    // before retrying. The unique index remains the final duplicate safeguard.
    const created = await Property.insertMany(documents, { ordered: true });
    return res.status(201).json({ success: true, message: `${created.length} properties generated.`, data: created });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A property already exists. Some lots may have been saved; refresh inventory before retrying."
      });
    }
    next(error);
  }
}
