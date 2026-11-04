import { assignProperty } from "../controllers/financeController.js";
import { Router } from "express";
import { createClient, getClient, listClients, updateClient } from "../controllers/clientController.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();
router.use(authenticate);
router.get("/", listClients);
router.get("/:id", getClient);
router.post("/:id/assignments", authorize("ADMIN", "STAFF"), assignProperty);
router.post("/", authorize("ADMIN", "STAFF"), createClient);
router.put("/:id", authorize("ADMIN", "STAFF"), updateClient);
export default router;
