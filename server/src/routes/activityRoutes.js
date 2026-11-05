import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";
import { listActivity } from "../controllers/activityController.js";
const router = Router();
router.use(authenticate, authorize("ADMIN"));
// Deliberately read-only: audit entries cannot be edited or deleted through API.
router.get("/", listActivity);
export default router;
