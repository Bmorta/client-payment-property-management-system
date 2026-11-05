import {Router} from "express";
import {authenticate} from "../middleware/auth.js";
import {authorize} from "../middleware/authorize.js";
import {auditMutation} from "../middleware/auditMutation.js";
import {listAgents,saveAgent,agentProfile} from "../controllers/commissionController.js";
const router=Router();router.use(authenticate,auditMutation);router.get("/",listAgents);router.get("/:id",agentProfile);router.post("/",authorize("ADMIN"),saveAgent);router.put("/:id",authorize("ADMIN"),saveAgent);export default router;
