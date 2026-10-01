import { Router } from "express";
import * as StudentController from "../controllers/student.controller";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";
import { requireSelf } from "../middleware/requireSelf";

const router = Router();

router.get(
  "/:email",
  verifyToken,
  requireRole("student"),
  requireSelf("email"),
  StudentController.getStats
);

export default router;