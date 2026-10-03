import { Router } from "express";
import * as AdminController from "../controllers/admin.controller";
import { verifyToken } from "../middleware/verifyToken";
import { requireRole } from "../middleware/requireRole";

const router = Router();

// Every admin route is token + admin-gated
router.use(verifyToken, requireRole("admin"));

// ---- Courses ----
router.get("/pending-courses", AdminController.getPendingCourses);
router.get("/courses", AdminController.getAllCourses);
router.patch("/courses/:id", AdminController.updateCourseApproval);
router.delete("/courses/:id", AdminController.deleteCourse);

// ---- Users ----
router.get("/users", AdminController.getUsers);
router.patch("/users/:id/role", AdminController.updateUserRole);
router.patch("/users/:id/block", AdminController.updateUserBlock);
router.delete("/users/:id", AdminController.deleteUser);

// ---- Dashboard ----
router.get("/dashboard", AdminController.getDashboard);

export default router;