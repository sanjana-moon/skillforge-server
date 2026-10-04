import type { Request, Response } from "express";
import * as EnrollmentService from "../services/enrollment.service.js";
import { param } from "../utils/param.js";

export async function createEnrollment(req: Request, res: Response) {
  try {
    const { courseId, courseTitle } = req.body as {
      courseId: string;
      courseTitle: string;
    };
    const studentEmail = req.user!.email as string;

    const out = await EnrollmentService.createEnrollment(
      courseId,
      courseTitle,
      studentEmail
    );

    if (out.status === "USER_NOT_FOUND")
      return res.status(404).send({ message: "User not found" });
    if (out.status === "ALREADY_ENROLLED")
      return res.status(200).send({ message: "Already enrolled" });

    res.send({ success: true, enrollment: out.result });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to enroll in course" });
  }
}

export async function getStudentEnrollments(req: Request, res: Response) {
  try {
    const email = param(req.params.email);                  // ← fixed
    const result = await EnrollmentService.getEnrollmentsByStudent(email);
    res.send(result);
  } catch (err) {
    console.error("Error fetching student enrollments:", err);
    res.status(500).send({ message: "Failed to fetch enrollments" });
  }
}

export async function updateProgress(req: Request, res: Response) {
  try {
    const id = param(req.params.id);                        // ← fixed
    const out = await EnrollmentService.updateEnrollmentProgress(
      id,
      req.user!.email as string,
      req.body.progress
    );

    if (out.status === "NOT_FOUND")
      return res.status(404).send({ message: "Enrollment not found" });
    if (out.status === "FORBIDDEN")
      return res
        .status(403)
        .send({ message: "Not authorized to update this enrollment" });

    res.send(out.result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update progress" });
  }
}

export async function checkEnrollment(req: Request, res: Response) {
  try {
    const courseId = param(req.params.courseId);            // ← fixed
    const enrolled = await EnrollmentService.checkEnrollment(
      courseId,
      req.user!.email as string
    );
    res.send({ enrolled });
  } catch (err) {
    console.error("Check enrollment error:", err);
    res.status(500).send({ message: "Failed to check enrollment" });
  }
}

export async function getMyEnrollments(req: Request, res: Response) {
  try {
    const enrollments = await EnrollmentService.getEnrollmentsByStudent(
      req.user!.email as string
    );
    res.send(enrollments);
  } catch (err) {
    console.error("Get user enrollments error:", err);
    res.status(500).send({ message: "Failed to fetch enrollments" });
  }
}