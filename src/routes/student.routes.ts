import { Router } from "express";
import * as StudentController from "../controllers/student.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireSelf } from "../middleware/requireSelf.js";

const router = Router();

router.get(
  "/:email",
  verifyToken,
  requireRole("student"),
  requireSelf("email"),
  StudentController.getStats
);

export default router;