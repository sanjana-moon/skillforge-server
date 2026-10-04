import { ObjectId } from "mongodb";
import { courseCollection, enrollmentCollection, usersCollection } from "../config/db.js";

export async function createEnrollment(
  courseId: string,
  courseTitle: string,
  studentEmail: string
) {
  const user = await usersCollection.findOne({ email: studentEmail });
  if (!user) return { status: "USER_NOT_FOUND" as const };

  const existing = await enrollmentCollection.findOne({
    courseId,
    studentEmail,
  });
  if (existing) return { status: "ALREADY_ENROLLED" as const };

  const result = await enrollmentCollection.insertOne({
    courseId,
    courseTitle,
    studentEmail,
    studentName: user.name,
    progress: 0,
    createdAt: new Date(),
  });

  await courseCollection.updateOne(
    { _id: new ObjectId(courseId) },
    { $inc: { enrollmentCount: 1 } }
  );

  return { status: "OK" as const, result };
}

export async function getEnrollmentsByStudent(email: string) {
  return enrollmentCollection
    .find({ studentEmail: email })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function updateEnrollmentProgress(
  enrollmentId: string,
  studentEmail: string,
  progress: number
) {
  const enrollment = await enrollmentCollection.findOne({
    _id: new ObjectId(enrollmentId),
  });
  if (!enrollment) return { status: "NOT_FOUND" as const };
  if (enrollment.studentEmail !== studentEmail)
    return { status: "FORBIDDEN" as const };

  const clamped = Math.max(0, Math.min(100, Number(progress)));

  const result = await enrollmentCollection.updateOne(
    { _id: new ObjectId(enrollmentId) },
    {
      $set: {
        progress: clamped,
        ...(clamped === 100 ? { completedAt: new Date() } : {}),
      },
    }
  );

  return { status: "OK" as const, result };
}

export async function checkEnrollment(courseId: string, email: string) {
  const enrollment = await enrollmentCollection.findOne({
    courseId,
    studentEmail: email,
  });
  return !!enrollment;
}