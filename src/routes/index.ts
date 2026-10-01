import { Router } from "express";
import healthRoutes from "./health.routes";
import userRoutes from "./user.routes";
import courseRoutes from "./course.routes";
import categoryRoutes from "./category.routes";
import enrollmentRoutes from "./enrollment.routes";
import checkoutRoutes from "./checkout.routes";
import profileRoutes from "./profile.routes";
import instructorRoutes from "./instructor.routes";
import studentRoutes from "./student.routes";
import adminRoutes from "./admin.routes";
import aiMentorRoutes from "./aiMentor.routes";

const router = Router();

router.use("/", healthRoutes);
router.use("/users", userRoutes);
router.use("/courses", courseRoutes);
router.use("/categories", categoryRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/profile", profileRoutes);
router.use("/instructor-stats", instructorRoutes);
router.use("/student-stats", studentRoutes);
router.use("/admin", adminRoutes);
router.use("/ai-mentor", aiMentorRoutes);

export default router;
