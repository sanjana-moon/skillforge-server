import {
  courseCollection,
  enrollmentCollection,
  paymentCollection,
  usersCollection,
  getDB,
} from "../config/db.js";
import type { Payment } from "../types/models.js";

export async function processCheckout(
  studentEmail: string,
  courseId: string,
  transactionId: string,
  paymentStatus: string
) {
  const user = await usersCollection.findOne({ email: studentEmail });
  if (!user) return { status: "USER_NOT_FOUND" as const };

  const { ObjectId } = await import("mongodb");

  const course = await courseCollection.findOne({
    _id: ObjectId.createFromHexString(courseId),
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
    { _id: ObjectId.createFromHexString(courseId) },
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

export async function getPaymentsByStudent(email: string) {
  const col = (await getDB()).collection<Payment>("payments");
  return col
    .find({ studentEmail: email })
    .sort({ paidAt: -1 })
    .toArray();
}