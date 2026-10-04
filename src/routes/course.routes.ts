import { Router } from "express";
import * as CourseController from "../controllers/course.controller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireSelf } from "../middleware/requireSelf.js";

const router = Router();

// ---------- Public listings (must be BEFORE /:id) ----------
router.get("/", CourseController.getCourses);
router.get("/featured", CourseController.getFeaturedCourses);

// ---------- Instructor-specific listing ----------
// Must be before /:id too, otherwise "/instructor" gets treated as an id
router.get(
  "/instructor/:email",
  verifyToken,
  requireRole("instructor"),
  requireSelf("email"),
  CourseController.getInstructorCourses
);

// ---------- Course content ----------
router.get("/:id/content", CourseController.getCourseContent);
router.post(
  "/:id/content",
  verifyToken,
  requireRole("instructor"),
  CourseController.saveCourseContent
);

// ---------- Lessons ----------
router.get("/:courseId/lessons/:lessonId", CourseController.getLesson);

// ---------- Create / update / publish / delete ----------
router.post("/", verifyToken, requireRole("instructor"), CourseController.createCourse);
router.patch("/:id", verifyToken, requireRole("instructor"), CourseController.updateCourse);
router.patch(
  "/:id/publish",
  verifyToken,
  requireRole("instructor", "admin"),
  CourseController.togglePublish
);
router.delete("/:id", verifyToken, requireRole("instructor"), CourseController.deleteCourse);

// ---------- Wildcard :id (MUST be last) ----------
router.get("/:id", CourseController.getCourseById);

export default router;