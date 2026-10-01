import { ObjectId } from "mongodb";
import {
  courseCollection,
  enrollmentCollection,
  paymentCollection,
  usersCollection,
} from "../config/db";

export async function processCheckout(
  studentEmail: string,
  courseId: string,
  transactionId: string,
  paymentStatus: string
) {
  const user = await usersCollection.findOne({ email: studentEmail });
  if (!user) return { status: "USER_NOT_FOUND" as const };

  const course = await courseCollection.findOne({
    _id: new ObjectId(courseId),
    approvalStatus: "approved",
    publishStatus: "published",
  });
  if (!course) return { status: "COURSE_NOT_FOUND" as const };

  const existingEnrollment = await enrollmentCollection.findOne({
    courseId,
    studentEmail,
  });
  if (existingEnrollment) return { status: "ALREADY_ENROLLED" as const };

  const existingPayment = await paymentCollection.findOne({ transactionId });
  if (existingPayment) return { status: "PAYMENT_EXISTS" as const };

  const enrollmentResult = await enrollmentCollection.insertOne({
    courseId,
    courseTitle: course.title,
    studentEmail,
    studentName: user.name,
    progress: 0,
    createdAt: new Date(),
  });

  await courseCollection.updateOne(
    { _id: new ObjectId(courseId) },
    { $inc: { enrollmentCount: 1 } }
  );

  await paymentCollection.insertOne({
    studentEmail,
    studentName: user.name,
    courseId,
    courseTitle: course.title,
    amount: course.price,
    transactionId,
    paymentStatus: paymentStatus || "paid",
    paidAt: new Date(),
  });

  return { status: "OK" as const, enrollment: enrollmentResult };
}