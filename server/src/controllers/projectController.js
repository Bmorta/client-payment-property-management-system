import Project from "../models/Project.js";
import { logActivity } from "../utils/activityLogger.js";

const allowedStatuses = ["PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"];

export const listProjects = async (req, res, next) => {
  try {
    const projects = await Project.find().populate("createdBy", "firstName lastName username").sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
};

export const getProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id).populate("createdBy", "firstName lastName username");
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
};

export const createProject = async (req, res, next) => {
  try {
    const { projectId, projectName, projectCode, description, location, startDate, status } = req.body;
    if (!projectId || !projectName || !projectCode) {
      return res.status(400).json({ success: false, message: "Project ID, name, and code are required." });
    }
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid project status." });
    }

    const project = await Project.create({
      projectId, projectName, projectCode, description, location,
      startDate: startDate || null,
      status: status || "PLANNING",
      createdBy: req.user._id
    });

    await logActivity({
      action: "PROJECT_CREATED",
      req,
      userId: req.user._id,
      entityType: "Project",
      entityId: project._id,
      metadata: { projectId: project.projectId, projectCode: project.projectCode }
    });

    res.status(201).json({ success: true, message: "Project created successfully.", data: project });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Project ID or project code already exists." });
    }
    next(error);
  }
};

export const updateProject = async (req, res, next) => {
  try {
    const { projectId, projectName, projectCode, description, location, startDate, status } = req.body;
    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid project status." });
    }

    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });

    Object.assign(project, {
      projectId: projectId ?? project.projectId,
      projectName: projectName ?? project.projectName,
      projectCode: projectCode ?? project.projectCode,
      description: description ?? project.description,
      location: location ?? project.location,
      startDate: startDate === "" ? null : (startDate ?? project.startDate),
      status: status ?? project.status
    });

    await project.save();

    await logActivity({
      action: "PROJECT_UPDATED",
      req,
      userId: req.user._id,
      entityType: "Project",
      entityId: project._id,
      metadata: { projectId: project.projectId, projectCode: project.projectCode }
    });

    res.json({ success: true, message: "Project updated successfully.", data: project });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: "Project ID or project code already exists." });
    }
    next(error);
  }
};

export const archiveProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "Project not found." });

    project.status = "ARCHIVED";
    await project.save();

    await logActivity({
      action: "PROJECT_ARCHIVED",
      req,
      userId: req.user._id,
      entityType: "Project",
      entityId: project._id,
      metadata: { projectId: project.projectId, projectCode: project.projectCode }
    });

    res.json({ success: true, message: "Project archived successfully.", data: project });
  } catch (error) {
    next(error);
  }
};
