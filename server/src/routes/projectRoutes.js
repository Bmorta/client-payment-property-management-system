import { Router } from "express";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "../controllers/projectController.js";
import { listProjectProperties, createProjectProperty, updateProjectPropertyArea, generateProjectProperties, updateProjectProperties } from "../controllers/propertyController.js";
import { listStructure, savePhase, saveBlock, changePhase, changeBlock, deletePhase, deleteBlock, deleteLot } from "../controllers/structureController.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.use(authenticate);
router.get("/", listProjects);
router.get("/:projectId/structure", listStructure);
router.post("/:projectId/phases", authorize("ADMIN", "STAFF"), savePhase);
router.put("/:projectId/phases/:id", authorize("ADMIN", "STAFF"), changePhase);
router.delete("/:projectId/phases/:id", authorize("ADMIN", "STAFF"), deletePhase);
router.post("/:projectId/blocks", authorize("ADMIN", "STAFF"), saveBlock);
router.put("/:projectId/blocks/:id", authorize("ADMIN", "STAFF"), changeBlock);
router.delete("/:projectId/blocks/:id", authorize("ADMIN", "STAFF"), deleteBlock);
router.delete("/:projectId/properties/:id", authorize("ADMIN", "STAFF"), deleteLot);
router.get("/:projectId/properties", listProjectProperties);
router.patch("/:projectId/properties/batch", authorize("ADMIN", "STAFF"), updateProjectProperties);
router.post("/:projectId/properties/generate", authorize("ADMIN", "STAFF"), generateProjectProperties);
router.post("/:projectId/properties", authorize("ADMIN", "STAFF"), createProjectProperty);
router.patch("/:projectId/properties/:propertyId/area", authorize("ADMIN", "STAFF"), updateProjectPropertyArea);
router.get("/:id", getProject);
router.post("/", authorize("ADMIN", "STAFF"), createProject);
router.put("/:id", authorize("ADMIN", "STAFF"), updateProject);
router.patch("/:id/archive", authorize("ADMIN", "STAFF"), archiveProject);

export default router;
