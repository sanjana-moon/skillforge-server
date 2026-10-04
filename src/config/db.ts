import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import { env } from "./env.js";

const client = new MongoClient(env.MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  serverSelectionTimeoutMS: 10000,
  maxPoolSize: 10,
});

// Start connecting immediately, keep the promise cached
let dbPromise: Promise<Db> | null = null;

export function getDB(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = client.connect().then((c) => {
      const db = c.db("skillforge");
      console.log("✅ Connected to MongoDB successfully!");

      // Fire-and-forget index creation
      Promise.allSettled([
        db.collection("enrollments").createIndex(
          { studentEmail: 1, courseId: 1 },
          { unique: true }
        ),
        db.collection("courses").createIndex({ instructorEmail: 1 }),
        db.collection("courses").createIndex({
          approvalStatus: 1,
          publishStatus: 1,
          createdAt: -1,
        }),
        db.collection("mentorSessions").createIndex({ userEmail: 1 }),
        db.collection("user").createIndex({ email: 1 }, { unique: true }),
        db.collection("payments").createIndex({ transactionId: 1 }, { unique: true }),
      ]).then((results) => {
        results.forEach((r, i) => {
          if (r.status === "rejected") console.error(`Index #${i} failed:`, r.reason);
        });
      });

      return db;
    });
  }
  return dbPromise;
}

// ============================================================
// Magic Proxy — looks like a Collection, but queues every call
// until the DB is actually connected.
//
// Usage: identical to before.
//   courseCollection.find(...)          ← still works
//   await courseCollection.findOne(...) ← still works
// ============================================================
function lazyCollection<T = any>(collectionName: string): T {
  // Cache real methods once resolved so repeated property reads are cheap
  const methodCache = new Map<string, (...args: any[]) => any>();

  return new Proxy({} as any, {
    get(_target, prop: string | symbol) {
      // Symbol props (Symbol.toStringTag, inspect, etc.) — pass through as undefined
      if (typeof prop === "symbol") return undefined;

      // Cache the async method wrapper per property
      if (methodCache.has(prop)) return methodCache.get(prop);

      const method = async (...args: any[]) => {
        const db = await getDB();
        const realCollection = db.collection(collectionName);
        const real = (realCollection as any)[prop];
        if (typeof real !== "function") return real;
        return real.apply(realCollection, args);
      };

      methodCache.set(prop, method);
      return method;
    },
  }) as T;
}

// ============================================================
// Exports — same names and shapes as before.
// Every method on these collections is automatically awaited
// against the real DB connection.
// ============================================================
export const courseCollection = lazyCollection("courses");
export const enrollmentCollection = lazyCollection("enrollments");
export const paymentCollection = lazyCollection("payments");
export const usersCollection = lazyCollection("user");
export const mentorSessionCollection = lazyCollection("mentorSessions");

// Keep this for server.ts compatibility
export async function connectDB(): Promise<void> {
  await getDB();
}