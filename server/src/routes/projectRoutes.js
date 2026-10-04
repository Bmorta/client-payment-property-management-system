import { Router } from "express";
import { archiveProject, createProject, getProject, listProjects, updateProject } from "../controllers/projectController.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.use(authenticate);
router.get("/", listProjects);
router.get("/:id", getProject);
router.post("/", authorize("ADMIN", "STAFF"), createProject);
router.put("/:id", authorize("ADMIN", "STAFF"), updateProject);
router.patch("/:id/archive", authorize("ADMIN", "STAFF"), archiveProject);

export default router;
