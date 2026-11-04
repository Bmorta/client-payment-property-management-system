import { Router } from "express";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "../controllers/projectController.js";
import { listProjectProperties, createProjectProperty, updateProjectPropertyArea } from "../controllers/propertyController.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.use(authenticate);
router.get("/", listProjects);
router.get("/:projectId/properties", listProjectProperties);
router.post("/:projectId/properties", authorize("ADMIN", "STAFF"), createProjectProperty);
router.patch("/:projectId/properties/:propertyId/area", authorize("ADMIN", "STAFF"), updateProjectPropertyArea);
router.get("/:id", getProject);
router.post("/", authorize("ADMIN", "STAFF"), createProject);
router.put("/:id", authorize("ADMIN", "STAFF"), updateProject);
router.patch("/:id/archive", authorize("ADMIN", "STAFF"), archiveProject);

export default router;
