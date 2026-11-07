import {Router} from "express";
import {authenticate} from "../middleware/auth.js";
import {authorize} from "../middleware/authorize.js";
import {auditMutation} from "../middleware/auditMutation.js";
import {deleteUnusedCommissions,previewCommissionAgreement,listCommissions,commissionAccount,saveCommissionAgreement,releaseCommission,recoverCommission,correctPayout} from "../controllers/commissionController.js";
import {exportCommissions} from "../controllers/commissionReportController.js";
const router=Router();router.use(authenticate,(req,res,next)=>req.path.endsWith("/agreement-preview")?next():auditMutation(req,res,next));router.post("/accounts/:id/agreement-preview",authorize("ADMIN"),previewCommissionAgreement);router.post("/accounts/:id/unused-entries/delete",authorize("ADMIN"),deleteUnusedCommissions);router.get("/",listCommissions);router.get("/export",exportCommissions);router.get("/accounts/:id",commissionAccount);router.put("/accounts/:id/agreement",authorize("ADMIN"),saveCommissionAgreement);router.post("/accounts/:id/payouts",authorize("ADMIN"),releaseCommission);router.post("/accounts/:id/recoveries",authorize("ADMIN"),recoverCommission);router.patch("/accounts/:id/payouts/:payoutId",authorize("ADMIN"),correctPayout);export default router;
