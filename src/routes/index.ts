import { Router } from "express";
import healthRoutes from "./health.routes.js";
import userRoutes from "./user.routes.js";
import courseRoutes from "./course.routes.js";
import categoryRoutes from "./category.routes.js";
import enrollmentRoutes from "./enrollment.routes.js";
import checkoutRoutes from "./checkout.routes.js";
import profileRoutes from "./profile.routes.js";
import instructorRoutes from "./instructor.routes.js";
import studentRoutes from "./student.routes.js";
import adminRoutes from "./admin.routes.js";
import aiMentorRoutes from "./aiMentor.routes.js";
import paymentRoutes from "./payment.routes.js";

const router = Router();

router.use("/", healthRoutes);
router.use("/users", userRoutes);
router.use("/courses", courseRoutes);
router.use("/categories", categoryRoutes);
router.use("/enrollments", enrollmentRoutes);
router.use("/checkout", checkoutRoutes);
router.use("/payments", paymentRoutes);
router.use("/profile", profileRoutes);
router.use("/instructor-stats", instructorRoutes);
router.use("/student-stats", studentRoutes);
router.use("/admin", adminRoutes);
router.use("/ai-mentor", aiMentorRoutes);

export default router;