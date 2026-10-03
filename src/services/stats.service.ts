import { courseCollection, enrollmentCollection } from "../config/db";

export async function getInstructorStats(email: string) {
  const courses = await courseCollection
    .find({ instructorEmail: email }, { projection: { content: 0 } })
    .toArray();

  const totalCourses = courses.length;
  const courseIds = courses.map((c) => c._id!.toString());

  const enrollments = await enrollmentCollection
    .find({ courseId: { $in: courseIds } })
    .toArray();

  const totalStudents = enrollments.length;

  const popularCourses = courses
    .sort((a, b) => (b.enrollmentCount || 0) - (a.enrollmentCount || 0))
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
  const enrollments = await enrollmentCollection
    .find({ studentEmail: email })
    .toArray();

  const enrolledCourses = enrollments.length;
  const completedCourses = enrollments.filter((e) => e.progress === 100).length;
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
  const [totalUsers, totalCourses, totalEnrollments, categoryStats] =
    await Promise.all([
      courseCollection.db.collection("user").countDocuments({ role: { $ne: "admin" } }),
      courseCollection.countDocuments(),
      enrollmentCollection.countDocuments(),
      courseCollection
        .aggregate([{ $group: { _id: "$category", value: { $sum: 1 } } }])
        .toArray(),
    ]);

  const coursesByCategory = categoryStats.map((item) => ({
    category: item._id,
    value: item.value,
  }));

  return { totalUsers, totalCourses, totalEnrollments, coursesByCategory };
}