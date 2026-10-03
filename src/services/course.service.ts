import { ObjectId } from "mongodb";
import { courseCollection, enrollmentCollection } from "../config/db";
import type { Course, PublishStatus } from "../types/models";

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

  const [totalCourses, courses] = await Promise.all([
    courseCollection.countDocuments(query),
    courseCollection
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

  return courseCollection
    .find(query, { projection: { content: 0 } })
    .sort({ enrollmentCount: -1, avgRating: -1, createdAt: -1 })
    .limit(pageSize)
    .toArray();
}

export async function findCourseById(id: string) {
  if (!ObjectId.isValid(id)) return null;
  return courseCollection.findOne(
    { _id: new ObjectId(id) },
    { projection: { content: 0 } }
  );
}

export async function findCourseContent(id: string) {
  if (!ObjectId.isValid(id)) return null;
  const course = await courseCollection.findOne({ _id: new ObjectId(id) });
  if (!course) return null;
  return course.content ?? { lessons: [] };
}

export async function findLesson(courseId: string, lessonId: string) {
  if (!ObjectId.isValid(courseId)) return null;
  const course = await courseCollection.findOne({
    _id: new ObjectId(courseId),
  });
  if (!course) return null;
  if (!course.content?.lessons) return null;
  return course.content.lessons.find((l) => l.id === lessonId) || null;
}

export async function saveCourseContent(
  courseId: string,
  content: NonNullable<Course["content"]>
): Promise<void> {
  await courseCollection.updateOne(
    { _id: new ObjectId(courseId) },
    { $set: { content, updatedAt: new Date() } }
  );
}

export async function listInstructorCourses(email: string) {
  return courseCollection
    .find({ instructorEmail: email }, { projection: { content: 0 } })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function createCourse(
  data: Partial<Course>,
  instructorEmail: string
) {
  return courseCollection.insertOne({
    ...(data as Course),
    instructorEmail,
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
  return courseCollection.updateOne(
    { _id: new ObjectId(courseId) },
    { $set: { ...data, price: Number(data.price) } }
  );
}

export async function setPublishStatus(
  courseId: string,
  publishStatus: PublishStatus
) {
  await courseCollection.updateOne(
    { _id: new ObjectId(courseId) },
    { $set: { publishStatus } }
  );
}

export async function deleteCourseAndEnrollments(courseId: string) {
  const result = await courseCollection.deleteOne({
    _id: new ObjectId(courseId),
  });
  await enrollmentCollection.deleteMany({ courseId });
  return result;
}

export async function listCategories() {
  return courseCollection
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
  return courseCollection.findOne({
    _id: new ObjectId(courseId),
    instructorEmail,
  });
}