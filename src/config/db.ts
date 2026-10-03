import { MongoClient, ServerApiVersion, Collection } from "mongodb";
import { env } from "./env";
import type {
  Course,
  Enrollment,
  Payment,
  AppUser,
  MentorSession,
} from "../types/models";

const client = new MongoClient(env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10,
});

// These are assigned inside connectDB()
export let courseCollection: Collection<Course>;
export let enrollmentCollection: Collection<Enrollment>;
export let paymentCollection: Collection<Payment>;
export let usersCollection: Collection<AppUser>;
export let mentorSessionCollection: Collection<MentorSession>;

export async function connectDB(): Promise<void> {
  await client.connect();
  const db = client.db("skillforge");

  courseCollection = db.collection("courses");
  enrollmentCollection = db.collection("enrollments");
  paymentCollection = db.collection("payments");
  usersCollection = db.collection("user");
  mentorSessionCollection = db.collection("mentorSessions");

  // Indexes run in the background: never block or crash startup
  Promise.allSettled([
    enrollmentCollection.createIndex(
      { studentEmail: 1, courseId: 1 },
      { unique: true }
    ),
    courseCollection.createIndex({ instructorEmail: 1 }),
    courseCollection.createIndex({
      approvalStatus: 1,
      publishStatus: 1,
      createdAt: -1,
    }),
    mentorSessionCollection.createIndex({ userEmail: 1 }),
    usersCollection.createIndex({ email: 1 }, { unique: true }),
    paymentCollection.createIndex({ transactionId: 1 }, { unique: true }),
  ]).then((results) => {
    results.forEach((r, i) => {
      if (r.status === "rejected") console.error(`Index #${i} failed:`, r.reason);
    });
  });

  console.log("✅ Connected to MongoDB successfully!");
}