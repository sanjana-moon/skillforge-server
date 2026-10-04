import type { Request, Response } from "express";
import * as CourseService from "../services/course.service.js";
import { param } from "../utils/param.js";
import type { Course } from "../types/models.js";

export async function getCourses(req: Request, res: Response) {
  try {
    const result = await CourseService.listCourses(req.query as any);
    res.send(result);
  } catch (err) {
    console.error("Error fetching courses:", err);
    res.status(500).send({ message: "Failed to fetch courses" });
  }
}

export async function getFeaturedCourses(req: Request, res: Response) {
  try {
    const { category, limit } = req.query as Record<string, string>;
    const courses = await CourseService.listFeaturedCourses(category, limit);
    res.send(courses);
  } catch (err) {
    console.error("Error fetching featured courses:", err);
    res.status(500).send({ message: "Failed to fetch featured courses" });
  }
}

export async function getCourseContent(req: Request, res: Response) {
  try {
    const id = param(req.params.id);
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).send({ message: "Invalid course ID" });
    }

    const content = await CourseService.findCourseContent(id);
    if (!content) return res.status(404).send({ message: "Course not found" });

    res.send({ content });
  } catch (err) {
    console.error("Error fetching course content:", err);
    res.status(500).send({ message: "Failed to fetch course content" });
  }
}

export async function saveCourseContent(req: Request, res: Response) {
  try {
    const id = param(req.params.id);
    if (!id || !/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).send({ message: "Invalid course ID" });
    }

    const { content } = req.body as {
      content: NonNullable<Course["content"]>;
    };

    const course = await CourseService.findCourseById(id);
    if (!course) return res.status(404).send({ message: "Course not found" });

    if (
      course.instructorEmail !== req.user?.email &&
      req.user?.role !== "admin"
    ) {
      return res
        .status(403)
        .send({ message: "Not authorized to update this course" });
    }

    await CourseService.saveCourseContent(id, content);
    res.send({ success: true, message: "Course content saved successfully" });
  } catch (err) {
    console.error("Error saving course content:", err);
    res.status(500).send({ message: "Failed to save course content" });
  }
}

export async function getLesson(req: Request, res: Response) {
  try {
    const courseId = param(req.params.courseId);
    const lessonId = param(req.params.lessonId);

    if (!courseId || !/^[a-f\d]{24}$/i.test(courseId)) {
      return res.status(400).send({ message: "Invalid course ID" });
    }

    const lesson = await CourseService.findLesson(courseId, lessonId);
    if (!lesson) return res.status(404).send({ message: "Lesson not found" });

    res.send(lesson);
  } catch (err) {
    console.error("Error fetching lesson:", err);
    res.status(500).send({ message: "Failed to fetch lesson" });
  }
}

export async function getInstructorCourses(req: Request, res: Response) {
  try {
    const email = param(req.params.email);
    const courses = await CourseService.listInstructorCourses(email);
    res.send(courses);
  } catch (err) {
    console.error("Error fetching instructor courses:", err);
    res.status(500).send({ message: "Failed to fetch instructor courses" });
  }
}

export async function createCourse(req: Request, res: Response) {
  try {
    const result = await CourseService.createCourse(
      req.body,
      req.user!.email as string
    );
    res.send(result);
  } catch (err) {
    console.error("Error creating course:", err);
    res.status(500).send({ message: "Failed to create course" });
  }
}

export async function updateCourse(req: Request, res: Response) {
  try {
    const id = param(req.params.id);

    const course = await CourseService.findCourseById(id);
    if (!course) return res.status(404).send({ message: "Course not found" });

    if (course.instructorEmail !== req.user?.email) {
      return res
        .status(403)
        .send({ message: "Not authorized to update this course" });
    }

    const result = await CourseService.updateCourse(id, req.body);
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update course" });
  }
}

export async function togglePublish(req: Request, res: Response) {
  try {
    const id = param(req.params.id);
    const { publishStatus } = req.body as {
      publishStatus: "published" | "unpublished";
    };

    if (!publishStatus) {
      return res.status(400).send({ message: "publishStatus is required" });
    }

    const course = await CourseService.findCourseById(id);
    if (!course) return res.status(404).send({ message: "Course not found" });

    if (
      course.instructorEmail !== req.user?.email &&
      req.user?.role !== "admin"
    ) {
      return res
        .status(403)
        .send({ message: "Not authorized to update this course" });
    }

    await CourseService.setPublishStatus(id, publishStatus);
    res.send({
      success: true,
      publishStatus,
      message: `Course ${
        publishStatus === "published" ? "published" : "unpublished"
      } successfully`,
    });
  } catch (err) {
    console.error("Publish error:", err);
    res.status(500).send({ message: "Failed to update publish status." });
  }
}

export async function deleteCourse(req: Request, res: Response) {
  try {
    const id = param(req.params.id);

    const course = await CourseService.findCourseById(id);
    if (!course) return res.status(404).send({ message: "Course not found" });

    if (course.instructorEmail !== req.user?.email) {
      return res
        .status(403)
        .send({ message: "Not authorized to delete this course" });
    }

    const result = await CourseService.deleteCourseAndEnrollments(id);
    res.send(result);
  } catch (err) {
    console.error("Error deleting course:", err);
    res.status(500).send({ message: "Failed to delete course" });
  }
}

export async function getCourseById(req: Request, res: Response) {
  try {
    const id = param(req.params.id);

    if (!/^[a-f\d]{24}$/i.test(id)) {
      return res.status(400).send({ message: "Invalid course ID" });
    }

    const course = await CourseService.findCourseById(id);
    if (!course) return res.status(404).send({ message: "Course not found" });

    res.send(course);
  } catch (err) {
    console.error("Error fetching course:", err);
    res.status(500).send({ message: "Failed to fetch course" });
  }
}