import mongoose from "mongoose";
import { validPrice, lotPrice } from "../utils/lotPricing.js";
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

    const { phaseNumber, blockNumber, lotNumber, areaSqm, pricePerSqm, status = "AVAILABLE" } = req.body;
    if (![phaseNumber, blockNumber, lotNumber].every(validPositiveInteger)) {
      return res.status(400).json({ success: false, message: "Phase, block and lot numbers must be positive integers." });
    }
    if (areaSqm !== null && areaSqm !== undefined &&
      (typeof areaSqm !== "number" || !Number.isFinite(areaSqm) || areaSqm <= 0)) {
      return res.status(400).json({ success: false, message: "Lot area must be a positive number, or left unspecified." });
    }

    if (!validPrice(pricePerSqm) || (areaSqm != null && pricePerSqm != null && lotPrice(areaSqm, pricePerSqm) === null)) {
      return res.status(400).json({ success: false, message: "Enter a valid price per sqm (up to two decimal places) and supported lot total." });
    }
    if (!["AVAILABLE", "RESERVED", "SOLD", "FOR_ASSUME"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid lot status." });
    }
    const location = { project: project._id, phaseNumber, blockNumber, lotNumber };
    if (await Property.exists(location)) {
      return res.status(409).json({ success: false, message: "This phase, block and lot already exists in the project." });
    }

    const propertyId = await generateRecordId("property");
    const property = await Property.create({
      ...location, propertyId, status, areaSqm: areaSqm ?? null, pricePerSqm: pricePerSqm ?? null, createdBy: req.user._id
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
        if (!validPositiveInteger(block?.blockNumber) || !validPositiveInteger(block?.lotCount) || !validPositiveInteger(block?.startLotNumber ?? 1)) {
          return res.status(400).json({ success: false, message: "Each block needs a positive block number and lot count." });
        }
        if (block.lotCount > 100 || locations.length + block.lotCount > 100) {
          return res.status(400).json({ success: false, message: "Generate no more than 100 lots per request." });
        }
        const areas = block.areasSqm;
        const statuses = block.statuses;
        const prices = block.pricesPerSqm;
        if (prices !== undefined && (!Array.isArray(prices) || prices.length !== block.lotCount || prices.some(p => !validPrice(p)))) {
          return res.status(400).json({ success: false, message: "Provide one valid price per sqm per lot (up to two decimal places), or leave blank." });
        }
        if (statuses !== undefined && (!Array.isArray(statuses) || statuses.length !== block.lotCount || statuses.some(s => !["AVAILABLE", "RESERVED", "SOLD", "FOR_ASSUME"].includes(s)))) {
          return res.status(400).json({ success: false, message: "Each lot must have a valid status." });
        }
        if (areas !== undefined && (!Array.isArray(areas) || areas.length !== block.lotCount)) {
          return res.status(400).json({ success: false, message: "areasSqm must have one entry per lot." });
        }
        for (let i = 0; i < block.lotCount; i++) {
          const areaSqm = areas?.[i] ?? null;
          if (areaSqm !== null && (typeof areaSqm !== "number" || !Number.isFinite(areaSqm) || areaSqm <= 0)) {
            return res.status(400).json({ success: false, message: "Each supplied lot area must be a positive number." });
          }
          const pricePerSqm = prices?.[i] ?? null;
          if (pricePerSqm !== null && areaSqm !== null && lotPrice(areaSqm, pricePerSqm) === null) {
            return res.status(400).json({ success: false, message: "Lot price exceeds supported range." });
          }
          const lotNumber = (block.startLotNumber ?? 1) + i;
          if (!Number.isSafeInteger(lotNumber)) return res.status(400).json({ success: false, message: "Lot number exceeds supported range." });
          const key = `${phase.phaseNumber}/${block.blockNumber}/${lotNumber}`;
          if (seen.has(key)) {
            return res.status(400).json({ success: false, message: "Duplicate phase/block/lot in request." });
          }
          seen.add(key);
          locations.push({ phaseNumber: phase.phaseNumber, blockNumber: block.blockNumber, lotNumber, areaSqm, pricePerSqm, status: statuses?.[i] ?? "AVAILABLE" });
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

/** Validate the entire edit batch before applying any changes. */
export async function updateProjectProperties(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.projectId)) {
      return res.status(400).json({ success: false, message: "Invalid project ID." });
    }
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    if (project.status === "ARCHIVED") {
      return res.status(409).json({ success: false, message: "Cannot edit lots in an archived project." });
    }
    const updates = req.body?.updates;
    if (!Array.isArray(updates) || updates.length === 0 || updates.length > 100) {
      return res.status(400).json({ success: false, message: "Provide 1 to 100 lots to update." });
    }
    const ids = new Set();
    for (const update of updates) {
      if (!mongoose.isValidObjectId(update?._id) || ids.has(update._id)) {
        return res.status(400).json({ success: false, message: "Invalid or repeated lot ID." });
      }
      ids.add(update._id);
      if (update.lotNumber !== undefined && !validPositiveInteger(update.lotNumber)) {
        return res.status(400).json({ success: false, message: "Lot numbers must be positive whole numbers." });
      }
      if (!validPrice(update.pricePerSqm) || (update.areaSqm != null && update.pricePerSqm != null && lotPrice(update.areaSqm, update.pricePerSqm) === null)) {
        return res.status(400).json({ success: false, message: "Enter a valid price per sqm (up to two decimal places) and supported lot total." });
      }
      if (update.areaSqm !== null && update.areaSqm !== undefined &&
        (typeof update.areaSqm !== "number" || !Number.isFinite(update.areaSqm) || update.areaSqm <= 0)) {
        return res.status(400).json({ success: false, message: "Each lot area must be positive or unspecified." });
      }
      if (!["AVAILABLE", "RESERVED", "SOLD", "FOR_ASSUME"].includes(update.status)) {
        return res.status(400).json({ success: false, message: "Invalid lot status." });
      }
    }
    const count = await Property.countDocuments({ project: project._id, _id: { $in: [...ids] } });
    if (count !== updates.length) {
      return res.status(404).json({ success: false, message: "One or more lots were not found in this project." });
    }
    const renumbered = updates.filter(update => update.lotNumber !== undefined);
    if (renumbered.length) {
      const lots = await Property.find({ project: project._id, _id: { $in: [...ids] } }).lean();
      const byId = new Map(lots.map(lot => [String(lot._id), lot]));
      const targets = new Set();
      const conflicts = [];
      for (const update of renumbered) {
        const lot = byId.get(update._id);
        if (!lot) return res.status(404).json({ success: false, message: "Lot not found. Refresh inventory." });
        const key = `${lot.phaseNumber}/${lot.blockNumber}/${update.lotNumber}`;
        if (targets.has(key)) return res.status(409).json({ success: false, message: "Duplicate lot number within the same phase and block. No changes saved." });
        targets.add(key);
        conflicts.push({ phaseNumber: lot.phaseNumber, blockNumber: lot.blockNumber, lotNumber: update.lotNumber, _id: { $ne: lot._id } });
      }
      if (await Property.exists({ project: project._id, $or: conflicts })) {
        return res.status(409).json({ success: false, message: "That lot number already exists in this phase and block. Choose an unused number. No changes saved." });
      }
    }
    const result = await Property.bulkWrite(updates.map(update => ({
      updateOne: {
        filter: { _id: update._id, project: project._id },
        update: { $set: { areaSqm: update.areaSqm ?? null, status: update.status, ...(update.lotNumber !== undefined ? { lotNumber: update.lotNumber } : {}), ...(update.pricePerSqm !== undefined ? { pricePerSqm: update.pricePerSqm } : {}) } }
      }
    })), { ordered: true });
    res.json({ success: true, message: `${result.matchedCount} lots saved.` });
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "Lot number already exists. Some edits may have been saved; refresh inventory before retrying." });
    next(error);
  }
}
