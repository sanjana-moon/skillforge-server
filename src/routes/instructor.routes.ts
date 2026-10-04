import { Router } from "express";
import * as InstructorController from "../controllers/instructor.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireSelf } from "../middleware/requireSelf.js";

const router = Router();

router.get(
  "/:email",
  verifyToken,
  requireRole("instructor"),
  requireSelf("email"),
  InstructorController.getStats
);

export default router;