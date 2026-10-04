import { Router } from "express";
import {
  createUser,
  listUsers,
  updateUser
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.use(authenticate, authorize("ADMIN"));

router.get("/", listUsers);
router.post("/", createUser);
router.patch("/:userId", updateUser);

export default router;
