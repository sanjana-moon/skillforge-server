import { Router } from "express";
import * as EnrollmentController from "../controllers/enrollment.controller";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";
import { requireSelf } from "../middleware/requireSelf";

const router = Router();

router.post("/", verifyToken, requireRole("student"), EnrollmentController.createEnrollment);

router.get(
  "/student/:email",
  verifyToken,
  requireRole("student"),
  requireSelf("email"),
  EnrollmentController.getStudentEnrollments
);

router.patch(
  "/:id/progress",
  verifyToken,
  requireRole("student"),
  EnrollmentController.updateProgress
);

// Must come BEFORE the generic "/:id" style routes if you ever add one
router.get("/check/:courseId", verifyToken, EnrollmentController.checkEnrollment);
router.get("/my", verifyToken, EnrollmentController.getMyEnrollments);

export default router;