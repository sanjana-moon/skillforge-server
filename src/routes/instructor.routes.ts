import { Router } from "express";
import * as InstructorController from "../controllers/instructor.controller";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";
import { requireSelf } from "../middleware/requireSelf";

const router = Router();

router.get(
  "/:email",
  verifyToken,
  requireRole("instructor"),
  requireSelf("email"),
  InstructorController.getStats
);

export default router;