import {
  courseCollection,
  enrollmentCollection,
  usersCollection,
  getDB,
} from "../config/db.js";
import type { Course, PublishStatus } from "../types/models.js";

interface ListCoursesParams {
  search?: string;
  category?: string;
  level?: string;
  minPrice?: string;
  maxPrice?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

export async function listCourses(params: ListCoursesParams) {
  const {
    search = "",
    category,
    level,
    minPrice,
    maxPrice,
    sort,
    page = "1",
    limit = "8",
  } = params;

  const currentPage = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(50, Math.max(1, Number(limit) || 8));

  const query: Record<string, unknown> = {
    approvalStatus: "approved",
    publishStatus: "published",
  };

  if (search) {
    const safe = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.$or = [
      { title: { $regex: safe, $options: "i" } },
      { category: { $regex: safe, $options: "i" } },
    ];
  }

  if (category && category !== "all") {
    const safeCat = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.category = { $regex: `^${safeCat}$`, $options: "i" };
  }
  if (level && level !== "all") query.level = level;

  if (minPrice || maxPrice) {
    const priceQuery: Record<string, number> = {};
    if (minPrice) priceQuery.$gte = Number(minPrice);
    if (maxPrice) priceQuery.$lte = Number(maxPrice);
    query.price = priceQuery;
  }

  let sortOption: Record<string, 1 | -1> = { createdAt: -1 };
  switch (sort) {
    case "title":
      sortOption = { title: 1 };
      break;
    case "price-low":
      sortOption = { price: 1 };
      break;
    case "price-high":
      sortOption = { price: -1 };
      break;
    case "rating":
      sortOption = { avgRating: -1 };
      break;
    case "newest":
      sortOption = { createdAt: -1 };
      break;
    case "popular":
      sortOption = { enrollmentCount: -1, createdAt: -1 };
      break;
  }

  const col = (await getDB()).collection<Course>("courses");

  const [totalCourses, courses] = await Promise.all([
    col.countDocuments(query),
    col
      .find(query, { projection: { content: 0 } })
      .sort(sortOption)
      .skip((currentPage - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
  ]);

  return {
    courses,
    totalCourses,
    currentPage,
    totalPages: Math.ceil(totalCourses / pageSize),
  };
}

export async function listFeaturedCourses(
  category: string | undefined,
  limit = "8"
) {
  const pageSize = Math.min(24, Math.max(1, Number(limit) || 8));

  const query: Record<string, unknown> = {
    approvalStatus: "approved",
    publishStatus: "published",
  };

  if (category && category !== "all") {
    const safeCat = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.category = { $regex: `^${safeCat}$`, $options: "i" };
  }

  const col = (await getDB()).collection<Course>("courses");

  return col
    .find(query, { projection: { content: 0 } })
    .sort({ enrollmentCount: -1, avgRating: -1, createdAt: -1 })
    .limit(pageSize)
    .toArray();
}

export async function findCourseById(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  return courseCollection.findOne(
    { _id: (await import("mongodb")).ObjectId.createFromHexString(id) },
    { projection: { content: 0 } }
  );
}

export async function findCourseContent(id: string) {
  if (!/^[a-f\d]{24}$/i.test(id)) return null;
  const { ObjectId } = await import("mongodb");
  const course = await courseCollection.findOne({
    _id: ObjectId.createFromHexString(id),
  });
  if (!course) return null;
  return course.content ?? { lessons: [] };
}

export async function findLesson(courseId: string, lessonId: string) {
  if (!/^[a-f\d]{24}$/i.test(courseId)) return null;
  const { ObjectId } = await import("mongodb");
  const course = await courseCollection.findOne({
    _id: ObjectId.createFromHexString(courseId),
  });
  if (!course) return null;
  if (!course.content?.lessons) return null;
  return (
    course.content.lessons.find((l: { id: string }) => l.id === lessonId) ||
    null
  );
}

export async function saveCourseContent(
  courseId: string,
  content: NonNullable<Course["content"]>
): Promise<void> {
  const { ObjectId } = await import("mongodb");
  await courseCollection.updateOne(
    { _id: ObjectId.createFromHexString(courseId) },
    { $set: { content, updatedAt: new Date() } }
  );
}

export async function listInstructorCourses(email: string) {
  const col = (await getDB()).collection<Course>("courses");
  return col
    .find({ instructorEmail: email }, { projection: { content: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function createCourse(
  data: Partial<Course>,
  instructorEmail: string
) {
  const instructor = await usersCollection.findOne({
    email: instructorEmail.toLowerCase(),
  });

  return courseCollection.insertOne({
    ...(data as Course),
    instructorEmail,
    instructorName: instructor?.name || instructorEmail.split("@")[0],
    price: Number(data.price),
    approvalStatus: "pending",
    publishStatus: "unpublished",
    avgRating: 0,
    reviewCount: 0,
    enrollmentCount: 0,
    whatYouWillLearn: data.whatYouWillLearn || [],
    requirements: data.requirements || [],
    targetAudience: data.targetAudience || [],
    createdAt: new Date(),
  });
}

export async function updateCourse(courseId: string, data: Partial<Course>) {
  const { ObjectId } = await import("mongodb");
  return courseCollection.updateOne(
    { _id: ObjectId.createFromHexString(courseId) },
    { $set: { ...data, price: Number(data.price) } }
  );
}

export async function setPublishStatus(
  courseId: string,
  publishStatus: PublishStatus
) {
  const { ObjectId } = await import("mongodb");
  await courseCollection.updateOne(
    { _id: ObjectId.createFromHexString(courseId) },
    { $set: { publishStatus } }
  );
}

export async function deleteCourseAndEnrollments(courseId: string) {
  const { ObjectId } = await import("mongodb");
  const result = await courseCollection.deleteOne({
    _id: ObjectId.createFromHexString(courseId),
  });
  await enrollmentCollection.deleteMany({ courseId });
  return result;
}

export async function listCategories() {
  const col = (await getDB()).collection<Course>("courses");
  return col
    .aggregate([
      { $match: { approvalStatus: "approved", publishStatus: "published" } },
      { $group: { _id: "$category", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { _id: 0, name: "$_id", count: 1 } },
    ])
    .toArray();
}

export async function findCourseOwnedBy(
  courseId: string,
  instructorEmail: string
) {
  const { ObjectId } = await import("mongodb");
  return courseCollection.findOne({
    _id: ObjectId.createFromHexString(courseId),
    instructorEmail,
  });
}