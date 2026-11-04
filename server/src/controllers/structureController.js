import mongoose from "mongoose";
import Project from "../models/Project.js";
import Phase from "../models/Phase.js";
import Block from "../models/Block.js";
import Property from "../models/Property.js";
import { generateRecordId } from "../utils/generateRecordId.js";

const valid = n => Number.isSafeInteger(n) && n > 0;
const fail = (res, status, message) => res.status(status).json({ success: false, message });
async function projectFor(req, res) {
  if (!mongoose.isValidObjectId(req.params.projectId)) {
    fail(res, 400, "Invalid project ID."); return null;
  }
  const project = await Project.findById(req.params.projectId);
  if (!project) { fail(res, 404, "Project not found."); return null; }
  return project;
}
const editable = (project, res) => project.status !== "ARCHIVED" ||
  (fail(res, 409, "Archived projects cannot be changed."), false);

export async function listStructure(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project) return;
    const [phases, blocks] = await Promise.all([
      Phase.find({ project: project._id }).sort({ phaseNumber: 1 }),
      Block.find({ project: project._id }).sort({ phaseNumber: 1, blockNumber: 1 })
    ]);
    res.json({ success: true, data: { phases, blocks } });
  } catch (e) { next(e); }
}

export async function savePhase(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    const phaseNumber = req.body?.phaseNumber;
    if (!valid(phaseNumber)) return fail(res, 400, "Enter a positive phase number.");
    if (await Phase.exists({ project: project._id, phaseNumber }) ||
        await Property.exists({ project: project._id, phaseNumber })) {
      return fail(res, 409, "Phase already exists.");
    }
    const phase = await Phase.create({ phaseId: await generateRecordId("phase"), project: project._id, phaseNumber });
    res.status(201).json({ success: true, data: phase, message: "Phase saved." });
  } catch (e) { if (e.code === 11000) return fail(res, 409, "Phase already exists."); next(e); }
}

export async function saveBlock(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    const { phaseNumber, blockNumber } = req.body ?? {};
    if (!valid(phaseNumber) || !valid(blockNumber)) return fail(res, 400, "Enter positive phase and block numbers.");
    const phaseExists = await Phase.exists({ project: project._id, phaseNumber }) ||
      await Property.exists({ project: project._id, phaseNumber });
    if (!phaseExists) return fail(res, 404, "Save the phase first.");
    if (await Block.exists({ project: project._id, phaseNumber, blockNumber }) ||
        await Property.exists({ project: project._id, phaseNumber, blockNumber })) {
      return fail(res, 409, "Block already exists.");
    }
    const block = await Block.create({
      blockId: await generateRecordId("block"), project: project._id, phaseNumber, blockNumber
    });
    res.status(201).json({ success: true, data: block, message: "Block saved." });
  } catch (e) { if (e.code === 11000) return fail(res, 409, "Block already exists."); next(e); }
}

export async function changePhase(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    const phase = await Phase.findOne({ _id: req.params.id, project: project._id });
    if (!phase) return fail(res, 404, "Phase not found.");
    const nextNumber = req.body?.phaseNumber;
    if (!valid(nextNumber)) return fail(res, 400, "Enter a positive phase number.");
    if (nextNumber !== phase.phaseNumber) {
      if (await Block.exists({ project: project._id, phaseNumber: phase.phaseNumber }) ||
          await Property.exists({ project: project._id, phaseNumber: phase.phaseNumber }))
        return fail(res, 409, "Cannot renumber a phase containing blocks or lots.");
      if (await Phase.exists({ project: project._id, phaseNumber: nextNumber }) ||
          await Property.exists({ project: project._id, phaseNumber: nextNumber }))
        return fail(res, 409, "Target phase already exists.");
      phase.phaseNumber = nextNumber; await phase.save();
    }
    res.json({ success: true, data: phase, message: "Phase updated." });
  } catch (e) { if (e.code === 11000) return fail(res, 409, "Target phase already exists."); next(e); }
}

export async function changeBlock(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    const block = await Block.findOne({ _id: req.params.id, project: project._id });
    if (!block) return fail(res, 404, "Block not found.");
    const nextNumber = req.body?.blockNumber;
    if (!valid(nextNumber)) return fail(res, 400, "Enter a positive block number.");
    if (nextNumber !== block.blockNumber) {
      if (await Property.exists({ project: project._id, phaseNumber: block.phaseNumber, blockNumber: block.blockNumber }))
        return fail(res, 409, "Cannot renumber a block containing lots.");
      if (await Block.exists({ project: project._id, phaseNumber: block.phaseNumber, blockNumber: nextNumber }) ||
          await Property.exists({ project: project._id, phaseNumber: block.phaseNumber, blockNumber: nextNumber }))
        return fail(res, 409, "Target block already exists.");
      block.blockNumber = nextNumber; await block.save();
    }
    res.json({ success: true, data: block, message: "Block updated." });
  } catch (e) { if (e.code === 11000) return fail(res, 409, "Target block already exists."); next(e); }
}

export async function deletePhase(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    const phase = await Phase.findOne({ _id: req.params.id, project: project._id });
    if (!phase) return fail(res, 404, "Phase not found.");
    if (await Block.exists({ project: project._id, phaseNumber: phase.phaseNumber }) ||
        await Property.exists({ project: project._id, phaseNumber: phase.phaseNumber }))
      return fail(res, 409, "Remove child blocks and lots before deleting this phase.");
    await phase.deleteOne();
    res.json({ success: true, message: "Empty phase deleted." });
  } catch (e) { next(e); }
}

export async function deleteBlock(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    const block = await Block.findOne({ _id: req.params.id, project: project._id });
    if (!block) return fail(res, 404, "Block not found.");
    if (await Property.exists({ project: project._id, phaseNumber: block.phaseNumber, blockNumber: block.blockNumber }))
      return fail(res, 409, "Remove all lots before deleting this block.");
    await block.deleteOne();
    res.json({ success: true, message: "Empty block deleted." });
  } catch (e) { next(e); }
}

export async function deleteLot(req, res, next) {
  try {
    const project = await projectFor(req, res); if (!project || !editable(project, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) return fail(res, 400, "Invalid lot ID.");
    const lot = await Property.findOne({ _id: req.params.id, project: project._id });
    if (!lot) return fail(res, 404, "Lot not found.");
    if (lot.status !== "AVAILABLE") return fail(res, 409, "Only available lots can be deleted.");
    // Do not hard-delete after client/property assignment modules are connected.
    // This operation is restricted to unassigned inventory in the current schema.
    await lot.deleteOne();
    res.json({ success: true, message: "Available lot deleted." });
  } catch (e) { next(e); }
}
