import { assignProperty } from "../controllers/financeController.js";
import { auditMutation } from "../middleware/auditMutation.js";
import { Router } from "express";
import { createClient, getClient, listClients, updateClient, changeClientDeletion } from "../controllers/clientController.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();
router.use(authenticate, auditMutation);
router.get("/", listClients);
router.delete("/:id",authorize("ADMIN"),changeClientDeletion);
router.post("/:id/restore",authorize("ADMIN"),changeClientDeletion);
router.get("/:id", getClient);
router.post("/:id/assignments", authorize("ADMIN", "STAFF"), assignProperty);
router.post("/", authorize("ADMIN", "STAFF"), createClient);
router.put("/:id", authorize("ADMIN", "STAFF"), updateClient);
export default router;
