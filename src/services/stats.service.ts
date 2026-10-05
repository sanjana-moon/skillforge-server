import {
  courseCollection,
  enrollmentCollection,
  usersCollection,
  getDB,
} from "../config/db.js";
import type { Course, Enrollment } from "../types/models.js";

export async function getInstructorStats(email: string) {
  const courseCol = (await getDB()).collection<Course>("courses");

  const courses = (await courseCol
    .find({ instructorEmail: email }, { projection: { content: 0 } })
    .toArray()) as Course[];

  const totalCourses = courses.length;
  const courseIds = courses.map((c) => c._id!.toString());

  const enrollCol = (await getDB()).collection<Enrollment>("enrollments");

  const enrollments = (await enrollCol
    .find({ courseId: { $in: courseIds } })
    .toArray()) as Enrollment[];

  const totalStudents = enrollments.length;

  const popularCourses = courses
    .sort(
      (a, b) => (b.enrollmentCount || 0) - (a.enrollmentCount || 0)
    )
    .slice(0, 5)
    .map((c) => ({
      title: c.title,
      enrollments: c.enrollmentCount || 0,
    }));

  const monthlyEnrollments: Record<string, number> = {};
  enrollments.forEach((e) => {
    const date = new Date(e.createdAt);
    const month = date.toLocaleString("default", { month: "short" });
    monthlyEnrollments[month] = (monthlyEnrollments[month] || 0) + 1;
  });

  const enrollmentChart = Object.entries(monthlyEnrollments).map(
    ([month, count]) => ({ month, enrollments: count })
  );

  return { totalCourses, totalStudents, popularCourses, enrollmentChart };
}

export async function getStudentStats(email: string) {
  const enrollCol = (await getDB()).collection<Enrollment>("enrollments");

  const enrollments = (await enrollCol
    .find({ studentEmail: email })
    .toArray()) as Enrollment[];

  const enrolledCourses = enrollments.length;
  const completedCourses = enrollments.filter(
    (e) => e.progress === 100
  ).length;
  const inProgress = enrollments.filter(
    (e) => e.progress > 0 && e.progress < 100
  ).length;

  const recentCourses = enrollments
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    .slice(0, 5);

  return { enrolledCourses, completedCourses, inProgress, recentCourses };
}

export async function getAdminDashboard() {
  const courseCol = (await getDB()).collection<Course>("courses");
  const enrollCol = (await getDB()).collection<Enrollment>("enrollments");

  const [totalUsers, totalCourses, totalEnrollments, categoryStats] =
    await Promise.all([
      usersCollection.countDocuments({ role: { $ne: "admin" } }),
      courseCol.countDocuments(),
      enrollCol.countDocuments(),
      courseCol
        .aggregate([{ $group: { _id: "$category", value: { $sum: 1 } } }])
        .toArray(),
    ]);

  const coursesByCategory = (
    categoryStats as { _id: string; value: number }[]
  ).map((item) => ({
    category: item._id,
    value: item.value,
  }));

  return { totalUsers, totalCourses, totalEnrollments, coursesByCategory };
}