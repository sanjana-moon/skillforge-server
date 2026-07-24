import express from "express";
import type { Request, Response, NextFunction } from "express";
import { GoogleGenAI } from "@google/genai";

import dotenv from 'dotenv';
import cors from 'cors';
import {
    MongoClient,
    ServerApiVersion,
    ObjectId,
    Collection,
} from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JWTPayload } from "jose";

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 5000;

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
});
app.use(
    cors({
        origin: process.env.CLIENT_URL,
        credentials: true,
    })
);
app.use(express.json());

const uri = process.env.MONGO_URI as string;


const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

const JWKS = createRemoteJWKSet(
    new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
    {
        timeoutDuration: 10000,
        cooldownDuration: 30000,
    }
);

// ============================
// TYPES
// ============================

type ApprovalStatus = "pending" | "approved" | "rejected";
type PublishStatus = "published" | "unpublished";
type UserRole = "student" | "instructor" | "admin";
type CourseLevel = "beginner" | "intermediate" | "advanced";

interface Course {
    _id?: ObjectId;
    title: string;
    category: string;
    level: CourseLevel;
    price: number;
    duration: string;
    description: string;
    thumbnail: string;
    instructorEmail: string;
    instructorName: string;
    approvalStatus: ApprovalStatus;
    publishStatus: PublishStatus;
    avgRating: number;
    reviewCount: number;
    enrollmentCount?: number;
    createdAt: Date;
    whatYouWillLearn?: string[];
    requirements?: string[];
    targetAudience?: string[];
    content?: {
        lessons: {
            id: string;
            title: string;
            description: string;
            content: string;
            codeExamples: {
                id: string;
                title: string;
                code: string;
                language: string;
                explanation: string;
            }[];
            practiceQuestions: {
                id: string;
                question: string;
                answer: string;
                hint: string;
            }[];
            youtubeLinks: string[];
            quickTips: string[];
        }[];
    };
}

interface Enrollment {
    _id?: ObjectId;
    courseId: string;
    courseTitle: string;
    studentEmail: string;
    studentName: string;
    progress: number;
    completedAt?: Date;
    createdAt: Date;
}

interface Payment {
    _id?: ObjectId;
    studentEmail: string;
    studentName: string;
    courseId: string;
    courseTitle: string;
    amount: number;
    transactionId: string;
    paymentStatus: string;
    paidAt: Date;
}

interface AppUser {
    _id?: ObjectId;
    name: string;
    email: string;
    role: UserRole;
    isBlocked: boolean;
    profileImage?: string | null;
}

interface MentorMessage {
    role: "user" | "assistant";
    content: string;
    createdAt: Date;
}

interface MentorSession {
    _id?: ObjectId;
    userEmail: string;
    title: string;
    messages: MentorMessage[];
    createdAt: Date;
    updatedAt: Date;
}

interface AuthenticatedRequest extends Request {
    user?: JWTPayload & {
        email?: string;
        name?: string;
        image?: string;
    };
}

// ============================
// AI MENTOR
// ============================

function toGeminiContents(messages: MentorMessage[]) {
    return messages
        .filter((m) => m.content && m.content.trim().length > 0)
        .map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
        }));
}

async function getMentorReply(conversation: MentorMessage[]): Promise<string> {
    const contents = toGeminiContents(conversation);

    if (contents.length === 0) {
        throw new Error("Empty conversation - nothing to send to Gemini.");
    }

    const models = [
        "gemini-3.1-flash-lite",
        "gemini-3.5-flash",
    ];

    let allQuotaExceeded = true;

    for (const model of models) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                console.log(`🤖 Using ${model} (Attempt ${attempt})`);

                const response = await ai.models.generateContent({
                    model,
                    contents,
                    config: {
                        systemInstruction: `
You are SkillForge AI Mentor.

Your role is to help students learn programming, web development, AI, and technology.

Rules:
- Be friendly and encouraging.
- Give concise but complete answers.
- Explain difficult concepts simply.
- Recommend learning resources when appropriate.
- If asked about careers, provide practical guidance.
- If you don't know something, say so instead of making it up.
`,
                    },
                });

                return response.text ?? "Sorry, I couldn't generate a response.";
            } catch (error: any) {
                console.error(`❌ ${model} failed (Attempt ${attempt})`, error);

                if (error.status !== 429) {
                    allQuotaExceeded = false;
                }

                if ((error.status === 503 || error.status === 429) && attempt < 3) {
                    const delay = error.status === 429 ? 40000 : attempt * 2000;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }

                if (error.status === 503 || error.status === 429) {
                    break;
                }

                throw error;
            }
        }
    }

    if (allQuotaExceeded) {
        throw new Error("QUOTA_EXCEEDED");
    }

    throw new Error(
        "AI service is temporarily unavailable. Please try again later."
    );
}
async function run() {
    await client.connect();
    await client.db("admin").command({ ping: 1 });

    const db = client.db("skillforge");

    const courseCollection: Collection<Course> = db.collection("courses");
    const enrollmentCollection: Collection<Enrollment> = db.collection("enrollments");
    const paymentCollection: Collection<Payment> = db.collection("payments");
    const usersCollection: Collection<AppUser> = db.collection("user");
    const mentorSessionCollection: Collection<MentorSession> = db.collection("mentorSessions");

    await enrollmentCollection.createIndex(
        { studentEmail: 1, courseId: 1 },
        { unique: true }
    );
    await courseCollection.createIndex({ instructorEmail: 1 });
    await courseCollection.createIndex({ approvalStatus: 1, publishStatus: 1 });
    await mentorSessionCollection.createIndex({ userEmail: 1 });
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await paymentCollection.createIndex({ transactionId: 1 }, { unique: true });

    // ============================
    // AUTH MIDDLEWARE (FIXED)
    // ============================

    const verifyToken = async (
        req: AuthenticatedRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            res.status(401).json({ message: "Unauthorized" });
            return;
        }

        try {
            const { payload } = await jwtVerify(token, JWKS);

            // Extract email from payload (could be in email or sub field)
            const email = typeof payload.email === 'string'
                ? payload.email
                : typeof payload.sub === 'string'
                    ? payload.sub
                    : undefined;

            req.user = {
                ...payload,
                email,
            };

            if (email) {
                const existingUser = await usersCollection.findOne({
                    email: email.toLowerCase()
                });

                if (!existingUser) {
                    const newUser: AppUser = {
                        name: (payload.name as string) || email.split('@')[0],
                        email: email.toLowerCase(),
                        role: "student",
                        isBlocked: false,
                        profileImage: (payload.image as string) || null,
                    };
                    await usersCollection.insertOne(newUser);
                    console.log(`✅ Auto-created user: ${email}`);
                }
            }

            next();
        } catch (error) {
            console.error("Token verification error:", error);
            res.status(403).json({ message: "Forbidden" });
        }
    };

    const requireRole = (...roles: UserRole[]) => {
        return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            try {
                const email = req.user?.email;

                if (!email) {
                    res.status(401).send({ message: "Unauthorized - No email" });
                    return;
                }

                // Find user (case-insensitive)
                let user = await usersCollection.findOne({
                    email: email.toLowerCase()
                });

                // ✅ If user doesn't exist, create them
                if (!user) {
                    const newUser: AppUser = {
                        name: req.user?.name as string || email.split('@')[0],
                        email: email.toLowerCase(),
                        role: "student",
                        isBlocked: false,
                        profileImage: req.user?.image as string || null,
                    };
                    await usersCollection.insertOne(newUser);
                    user = await usersCollection.findOne({
                        email: email.toLowerCase()
                    });
                    console.log(`✅ Auto-created user in requireRole: ${email}`);
                }

                if (!user) {
                    res.status(404).send({ message: "User not found" });
                    return;
                }

                if (user.isBlocked) {
                    res.status(403).send({ message: "Your account has been blocked." });
                    return;
                }

                if (!roles.includes(user.role)) {
                    res.status(403).send({
                        message: `Forbidden - Required role: ${roles.join(", ")}`
                    });
                    return;
                }

                next();
            } catch (error) {
                console.error("requireRole error:", error);
                res.status(500).send({ message: "Internal server error" });
            }
        };
    };

    const requireSelf = (paramName: string) => {
        return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
            const target = req.params[paramName];

            if (req.user?.email !== target) {
                res.status(403).send({ message: "Forbidden" });
                return;
            }

            next();
        };
    };

    // ============================
    // USERS
    // ============================

    app.post("/api/users", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const email = req.user?.email;

            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }

            const { name, role } = req.body as { name: string; role?: UserRole };
            const allowedRoles: UserRole[] = ["student", "instructor"];
            const resolvedRole: UserRole = role && allowedRoles.includes(role) ? role : "student";

            const existing = await usersCollection.findOne({ email });

            if (existing) {
                if (existing.role === undefined || existing.isBlocked === undefined) {
                    await usersCollection.updateOne(
                        { email },
                        {
                            $set: {
                                role: existing.role ?? resolvedRole,
                                isBlocked: existing.isBlocked ?? false,
                            },
                        }
                    );
                    const patched = await usersCollection.findOne({ email });
                    res.send(patched);
                    return;
                }

                res.send(existing);
                return;
            }

            const newUser: AppUser = {
                name,
                email,
                role: resolvedRole,
                isBlocked: false,
            };

            const result = await usersCollection.insertOne(newUser);
            res.send({ ...newUser, _id: result.insertedId });
        } catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to create user" });
        }
    });

    // ============================
    // COURSES (public listing)
    // ============================

    app.get("/api/courses", async (req: Request, res: Response) => {
        try {
            const {
                search = "",
                category,
                level,
                minPrice,
                maxPrice,
                sort,
                page = "1",
                limit = "8",
            } = req.query as Record<string, string>;

            const currentPage = Number(page);
            const pageSize = Number(limit);

            const query: Record<string, unknown> = {
                approvalStatus: "approved",
                publishStatus: "published",
            };

            if (search) {
                query.$or = [
                    { title: { $regex: search, $options: "i" } },
                    { category: { $regex: search, $options: "i" } },
                ];
            }

            if (category && category !== "all") {
                query.category = category;
            }

            if (level && level !== "all") {
                query.level = level;
            }

            if (minPrice || maxPrice) {
                const priceQuery: Record<string, number> = {};
                if (minPrice) priceQuery.$gte = Number(minPrice);
                if (maxPrice) priceQuery.$lte = Number(maxPrice);
                query.price = priceQuery;
            }

            let sortOption: Record<string, 1 | -1> = {};

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
            }

            const totalCourses = await courseCollection.countDocuments(query);

            const courses = await courseCollection
                .find(query)
                .sort(sortOption)
                .skip((currentPage - 1) * pageSize)
                .limit(pageSize)
                .toArray();

            res.send({
                courses,
                totalCourses,
                currentPage,
                totalPages: Math.ceil(totalCourses / pageSize),
            });
        } catch (error) {
            res.status(500).send({ message: "Failed to fetch courses" });
        }
    });

    app.get("/api/courses/featured", async (req: Request, res: Response) => {
        try {
            const courses = await courseCollection
                .find({ approvalStatus: "approved", publishStatus: "published" })
                .sort({ enrollmentCount: -1, createdAt: -1 })
                .limit(8)
                .toArray();

            res.send(courses);
        } catch (error) {
            res.status(500).send({ message: "Failed to fetch featured courses" });
        }
    });

    app.get("/api/categories", async (req: Request, res: Response) => {
        try {
            const categories = await courseCollection.distinct("category", {
                approvalStatus: "approved",
                publishStatus: "published",
            });

            res.send(categories);
        } catch (error) {
            res.status(500).send({ message: "Failed to fetch categories" });
        }
    });

    // ============================
    // COURSE CONTENT ROUTES
    // ============================

    // GET course content (public)
    app.get("/api/courses/:id/content", async (req: Request, res: Response) => {
        try {
            const { id } = req.params;

            // ✅ Ensure id is a string
            const courseId = Array.isArray(id) ? id[0] : id;

            if (!courseId || !ObjectId.isValid(courseId)) {
                res.status(400).send({ message: "Invalid course ID" });
                return;
            }

            const course = await courseCollection.findOne({
                _id: new ObjectId(courseId),
            });

            if (!course) {
                res.status(404).send({ message: "Course not found" });
                return;
            }

            res.send({
                content: course.content || { lessons: [] },
            });
        } catch (error) {
            console.error("Error fetching course content:", error);
            res.status(500).send({ message: "Failed to fetch course content" });
        }
    });

    // SAVE course content (instructor only)
    app.post("/api/courses/:id/content", verifyToken, requireRole("instructor"),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { id } = req.params;
                const { content } = req.body as { content: any };

                // ✅ Ensure id is a string
                const courseId = Array.isArray(id) ? id[0] : id;

                if (!courseId || !ObjectId.isValid(courseId)) {
                    res.status(400).send({ message: "Invalid course ID" });
                    return;
                }

                const course = await courseCollection.findOne({
                    _id: new ObjectId(courseId),
                });

                if (!course) {
                    res.status(404).send({ message: "Course not found" });
                    return;
                }

                // Check if user is the instructor or admin
                if (course.instructorEmail !== req.user?.email && req.user?.role !== "admin") {
                    res.status(403).send({ message: "Not authorized to update this course" });
                    return;
                }

                await courseCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    {
                        $set: {
                            content: content,
                            updatedAt: new Date(),
                        },
                    }
                );

                res.send({
                    success: true,
                    message: "Course content saved successfully",
                });
            } catch (error) {
                console.error("Error saving course content:", error);
                res.status(500).send({ message: "Failed to save course content" });
            }
        }
    );

    // GET a specific lesson from a course (public)
    app.get("/api/courses/:courseId/lessons/:lessonId", async (req: Request, res: Response) => {
        try {
            const { courseId, lessonId } = req.params;

            // ✅ Ensure courseId is a string
            const courseIdStr = Array.isArray(courseId) ? courseId[0] : courseId;
            const lessonIdStr = Array.isArray(lessonId) ? lessonId[0] : lessonId;

            if (!courseIdStr || !ObjectId.isValid(courseIdStr)) {
                res.status(400).send({ message: "Invalid course ID" });
                return;
            }

            const course = await courseCollection.findOne({
                _id: new ObjectId(courseIdStr),
            });

            if (!course) {
                res.status(404).send({ message: "Course not found" });
                return;
            }

            const lesson = course.content?.lessons?.find((l) => l.id === lessonIdStr);

            if (!lesson) {
                res.status(404).send({ message: "Lesson not found" });
                return;
            }

            res.send(lesson);
        } catch (error) {
            console.error("Error fetching lesson:", error);
            res.status(500).send({ message: "Failed to fetch lesson" });
        }
    });

    // ============================
    // INSTRUCTOR COURSE ROUTES
    // ============================

    app.get("/api/courses/instructor/:email", verifyToken, requireRole("instructor"), requireSelf("email"),
        async (req: Request, res: Response) => {
            const email = req.params.email;

            const result = await courseCollection
                .find({ instructorEmail: email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        }
    );

    app.post("/api/courses", verifyToken, requireRole("instructor"),
        async (req: AuthenticatedRequest, res: Response) => {
            const data = req.body as Partial<Course>;

            const result = await courseCollection.insertOne({
                ...(data as Course),
                instructorEmail: req.user!.email as string,
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

            res.send(result);
        }
    );

    app.patch("/api/courses/:id", verifyToken, requireRole("instructor"),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { id } = req.params;
                const updatedData = req.body as Partial<Course>;

                const course = await courseCollection.findOne({
                    _id: new ObjectId(id as string),
                });

                if (!course) {
                    res.status(404).send({ message: "Course not found" });
                    return;
                }

                if (course.instructorEmail !== req.user?.email) {
                    res.status(403).send({ message: "Not authorized to update this course" });
                    return;
                }

                const result = await courseCollection.updateOne(
                    { _id: new ObjectId(id as string) },
                    {
                        $set: {
                            ...updatedData,
                            price: Number(updatedData.price),
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to update course" });
            }
        }
    );

    // ============================
    // PUBLISH/UNPUBLISH COURSE (Instructor & Admin)
    // ============================

    app.patch("/api/courses/:id/publish", verifyToken, requireRole("instructor", "admin"),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { id } = req.params;
                const { publishStatus } = req.body as { publishStatus: PublishStatus };

                if (!publishStatus) {
                    res.status(400).send({ message: "publishStatus is required" });
                    return;
                }

                const course = await courseCollection.findOne({
                    _id: new ObjectId(id as string),
                });

                if (!course) {
                    res.status(404).send({ message: "Course not found" });
                    return;
                }

                if (course.instructorEmail !== req.user?.email && req.user?.role !== "admin") {
                    res.status(403).send({ message: "Not authorized to update this course" });
                    return;
                }

                await courseCollection.updateOne(
                    { _id: new ObjectId(id as string) },
                    { $set: { publishStatus } }
                );

                res.send({
                    success: true,
                    publishStatus,
                    message: `Course ${publishStatus === "published" ? "published" : "unpublished"} successfully`
                });
            } catch (err) {
                console.error("Publish error:", err);
                res.status(500).send({ message: "Failed to update publish status." });
            }
        }
    );

    app.delete("/api/courses/:id", verifyToken, requireRole("instructor"),
        async (req: AuthenticatedRequest, res: Response) => {
            const { id } = req.params;

            const course = await courseCollection.findOne({ _id: new ObjectId(id as string) });

            if (!course) {
                res.status(404).send({ message: "Course not found" });
                return;
            }

            if (course.instructorEmail !== req.user?.email) {
                res.status(403).send({ message: "Not authorized to delete this course" });
                return;
            }

            const result = await courseCollection.deleteOne({ _id: new ObjectId(id as string) });

            await enrollmentCollection.deleteMany({ courseId: id as string });

            res.send(result);
        }
    );

    // wildcard :id last among /api/courses/* routes
    app.get("/api/courses/:id", async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const result = await courseCollection.findOne({
                _id: new ObjectId(id as string),
            });

            if (!result) {
                res.status(404).send({ message: "Course not found" });
                return;
            }

            res.send(result);
        } catch (error) {
            console.error("Error fetching course:", error);
            res.status(500).send({ message: "Failed to fetch course" });
        }
    });

    // ============================
    // INSTRUCTOR DASHBOARD
    // ============================

    app.get("/api/instructor-stats/:email", verifyToken, requireRole("instructor"), requireSelf("email"),
        async (req: Request, res: Response) => {
            try {
                const { email } = req.params;

                const courses = await courseCollection
                    .find({ instructorEmail: email as string })
                    .toArray();

                const totalCourses = courses.length;
                const courseIds = courses.map((c) => (c._id as ObjectId).toString());

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

                    if (!monthlyEnrollments[month]) {
                        monthlyEnrollments[month] = 0;
                    }

                    monthlyEnrollments[month] += 1;
                });

                const enrollmentChart = Object.entries(monthlyEnrollments).map(
                    ([month, count]) => ({ month, enrollments: count })
                );

                res.send({
                    totalCourses,
                    totalStudents,
                    popularCourses,
                    enrollmentChart,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to load instructor dashboard stats" });
            }
        }
    );

    // ============================
    // ENROLLMENTS
    // ============================

    app.post("/api/enrollments", verifyToken, requireRole("student"),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { courseId, courseTitle } = req.body as {
                    courseId: string;
                    courseTitle: string;
                };

                const studentEmail = req.user!.email as string;

                // Get user from database
                const user = await usersCollection.findOne({
                    email: studentEmail,
                });

                if (!user) {
                    res.status(404).send({
                        message: "User not found",
                    });
                    return;
                }

                // Check if already enrolled
                const existing = await enrollmentCollection.findOne({
                    courseId,
                    studentEmail,
                });

                if (existing) {
                    res.status(200).send({
                        message: "Already enrolled",
                    });
                    return;
                }

                // Create enrollment
                const result = await enrollmentCollection.insertOne({
                    courseId,
                    courseTitle,
                    studentEmail,
                    studentName: user.name,
                    progress: 0,
                    createdAt: new Date(),
                });

                // Increase enrollment count
                await courseCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    {
                        $inc: {
                            enrollmentCount: 1,
                        },
                    }
                );

                res.send({
                    success: true,
                    enrollment: result,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({
                    message: "Failed to enroll in course",
                });
            }
        }
    );

    app.get("/api/enrollments/student/:email", verifyToken, requireRole("student"), requireSelf("email"),
        async (req: Request, res: Response) => {
            const email = req.params.email;

            const result = await enrollmentCollection
                .find({ studentEmail: email })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(result);
        }
    );

    app.patch("/api/enrollments/:id/progress", verifyToken, requireRole("student"),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { id } = req.params;
                const { progress } = req.body as { progress: number };

                const enrollment = await enrollmentCollection.findOne({
                    _id: new ObjectId(id as string),
                });

                if (!enrollment) {
                    res.status(404).send({ message: "Enrollment not found" });
                    return;
                }

                if (enrollment.studentEmail !== req.user?.email) {
                    res.status(403).send({ message: "Not authorized to update this enrollment" });
                    return;
                }

                const clamped = Math.max(0, Math.min(100, Number(progress)));

                const result = await enrollmentCollection.updateOne(
                    { _id: new ObjectId(id as string) },
                    {
                        $set: {
                            progress: clamped,
                            ...(clamped === 100 ? { completedAt: new Date() } : {}),
                        },
                    }
                );

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to update progress" });
            }
        }
    );

    app.get("/api/enrollments/check/:courseId", verifyToken,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { courseId } = req.params;
                const userEmail = req.user?.email;

                if (!userEmail) {
                    res.status(401).send({ message: "Unauthorized" });
                    return;
                }

                const enrollment = await enrollmentCollection.findOne({
                    courseId,
                    studentEmail: userEmail,
                });

                res.send({ enrolled: !!enrollment });
            } catch (error) {
                console.error("Check enrollment error:", error);
                res.status(500).send({ message: "Failed to check enrollment" });
            }
        }
    );

    // GET user's all enrollments
    app.get("/api/enrollments/my", verifyToken,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const userEmail = req.user?.email;

                if (!userEmail) {
                    res.status(401).send({ message: "Unauthorized" });
                    return;
                }

                const enrollments = await enrollmentCollection
                    .find({ studentEmail: userEmail })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(enrollments);
            } catch (error) {
                console.error("Get user enrollments error:", error);
                res.status(500).send({ message: "Failed to fetch enrollments" });
            }
        }
    );

    // ============================
    // ✅ CHECKOUT - Store enrollment & payment in MongoDB
    // ============================

    app.post("/api/checkout", verifyToken, requireRole("student"),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { courseId, transactionId, paymentStatus } = req.body as {
                    courseId: string;
                    transactionId: string;
                    paymentStatus: string;
                };

                const studentEmail = req.user!.email as string;

                // Get user from database
                const user = await usersCollection.findOne({
                    email: studentEmail,
                });

                if (!user) {
                    res.status(404).send({
                        success: false,
                        message: "User not found",
                    });
                    return;
                }

                // Check if course exists and is approved/published
                const course = await courseCollection.findOne({
                    _id: new ObjectId(courseId),
                    approvalStatus: "approved",
                    publishStatus: "published",
                });

                if (!course) {
                    res.status(404).send({
                        success: false,
                        message: "Course not found or not available",
                    });
                    return;
                }

                // Check if already enrolled
                const existingEnrollment = await enrollmentCollection.findOne({
                    courseId,
                    studentEmail,
                });

                if (existingEnrollment) {
                    res.status(200).send({
                        success: true,
                        message: "Already enrolled",
                    });
                    return;
                }

                // Check if payment already processed
                const existingPayment = await paymentCollection.findOne({
                    transactionId,
                });

                if (existingPayment) {
                    res.status(200).send({
                        success: true,
                        message: "Payment already processed",
                    });
                    return;
                }

                // Create enrollment
                const enrollmentResult = await enrollmentCollection.insertOne({
                    courseId,
                    courseTitle: course.title,
                    studentEmail,
                    studentName: user.name,
                    progress: 0,
                    createdAt: new Date(),
                });

                // Update course enrollment count
                await courseCollection.updateOne(
                    { _id: new ObjectId(courseId) },
                    {
                        $inc: {
                            enrollmentCount: 1,
                        },
                    }
                );

                // Create payment record
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

                res.send({
                    success: true,
                    enrollment: enrollmentResult,
                    message: "Enrollment created successfully",
                });
            } catch (error) {
                console.error("Checkout error:", error);
                res.status(500).send({
                    success: false,
                    message: "Checkout failed",
                });
            }
        }
    );

    // ============================
    // STUDENT DASHBOARD
    // ============================

    app.get("/api/student-stats/:email", verifyToken, requireRole("student"), requireSelf("email"),
        async (req: Request, res: Response) => {
            try {
                const { email } = req.params;

                const enrollments = await enrollmentCollection
                    .find({ studentEmail: email as string })
                    .toArray();

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

                res.send({
                    enrolledCourses,
                    completedCourses,
                    inProgress,
                    recentCourses,
                });
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to load student dashboard" });
            }
        }
    );

    // ============================
    // PROFILE
    // ============================

    app.get("/api/profile", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const email = req.user?.email;

            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }

            const user = await usersCollection.findOne({ email });

            if (!user) {
                res.status(404).send({ message: "User not found" });
                return;
            }

            res.send({
                name: user.name,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage || null,
            });
        } catch (error) {
            console.error("Error fetching profile:", error);
            res.status(500).send({ message: "Failed to load profile" });
        }
    });

    app.put("/api/profile", verifyToken, async (req: AuthenticatedRequest, res: Response) => {
        try {
            const email = req.user?.email;

            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }

            const { name, email: newEmail, profileImage } = req.body as {
                name: string;
                email?: string;
                profileImage?: string;
            };

            if (!name) {
                res.status(400).send({ message: "Name is required" });
                return;
            }

            const emailChanging = !!newEmail && newEmail !== email;

            if (emailChanging) {
                const existingUser = await usersCollection.findOne({ email: newEmail });

                if (existingUser) {
                    res.status(400).send({
                        message: "Email already in use by another account",
                    });
                    return;
                }
            }

            const updateData: Partial<AppUser> = { name };

            if (emailChanging) {
                updateData.email = newEmail;
            }

            if (profileImage !== undefined) {
                updateData.profileImage = profileImage;
            }

            const result = await usersCollection.updateOne(
                { email },
                { $set: updateData }
            );

            if (result.matchedCount === 0) {
                res.status(404).send({ message: "User not found" });
                return;
            }

            if (emailChanging) {
                await courseCollection.updateMany(
                    { instructorEmail: email },
                    { $set: { instructorEmail: newEmail } }
                );
                await enrollmentCollection.updateMany(
                    { studentEmail: email },
                    { $set: { studentEmail: newEmail } }
                );
                await mentorSessionCollection.updateMany(
                    { userEmail: email },
                    { $set: { userEmail: newEmail } }
                );
            }

            const updatedUser = await usersCollection.findOne({
                email: newEmail || email,
            });

            res.send({
                name: updatedUser?.name,
                email: updatedUser?.email,
                role: updatedUser?.role,
                profileImage: updatedUser?.profileImage || null,
            });
        } catch (error) {
            console.error("Profile update error:", error);
            res.status(500).send({ message: "Failed to update profile" });
        }
    });

    // ============================
    // ADMIN
    // ============================

    app.get("/api/admin/pending-courses", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const courses = await courseCollection
                    .find({ approvalStatus: "pending" })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(courses);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch pending courses." });
            }
        }
    );

    app.get("/api/admin/courses", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const { status } = req.query as { status?: string };
                const query: Record<string, unknown> = {};

                if (status && status !== "all") {
                    query.approvalStatus = status;
                }

                const result = await courseCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(result);
            } catch (error) {
                res.status(500).send({ message: "Failed to fetch courses" });
            }
        }
    );

    app.patch("/api/admin/courses/:id", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            const id = req.params.id;
            const { approvalStatus } = req.body as { approvalStatus: ApprovalStatus };

            if (!approvalStatus) {
                res.status(400).send({ message: "approvalStatus is required" });
                return;
            }

            const result = await courseCollection.updateOne(
                { _id: new ObjectId(id as string) },
                { $set: { approvalStatus } }
            );

            res.send(result);
        }
    );

    app.delete("/api/admin/courses/:id", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const id = req.params.id as string;

                const result = await courseCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                if (result.deletedCount === 0) {
                    res.status(404).send({ message: "Course not found" });
                    return;
                }

                await enrollmentCollection.deleteMany({ courseId: id });

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to delete course" });
            }
        }
    );

    app.get("/api/admin/users", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const users = await usersCollection
                    .find({ role: { $ne: "admin" } })
                    .sort({ name: 1 })
                    .toArray();

                res.send(users);
            } catch (err) {
                res.status(500).send({ message: "Failed to fetch users" });
            }
        }
    );

    app.patch("/api/admin/users/:id/role", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { role } = req.body as { role: UserRole };

                const allowedRoles: UserRole[] = ["student", "instructor", "admin"];

                if (!allowedRoles.includes(role)) {
                    res.status(400).send({ message: "Invalid role" });
                    return;
                }

                await usersCollection.updateOne(
                    { _id: new ObjectId(id as string) },
                    { $set: { role } }
                );

                res.send({ success: true });
            } catch (err) {
                res.status(500).send({ message: "Failed to update role" });
            }
        }
    );

    app.patch("/api/admin/users/:id/block", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const { id } = req.params;
                const { isBlocked } = req.body as { isBlocked: boolean };

                await usersCollection.updateOne(
                    { _id: new ObjectId(id as string) },
                    { $set: { isBlocked: !!isBlocked } }
                );

                res.send({ success: true, isBlocked: !!isBlocked });
            } catch (err) {
                res.status(500).send({ message: "Failed to update block status" });
            }
        }
    );

    app.delete("/api/admin/users/:id", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const id = req.params.id as string;

                const result = await usersCollection.deleteOne({
                    _id: new ObjectId(id),
                });

                if (result.deletedCount === 0) {
                    res.status(404).send({ message: "User not found" });
                    return;
                }

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: "Failed to delete user" });
            }
        }
    );

    app.get("/api/admin/dashboard", verifyToken, requireRole("admin"),
        async (req: Request, res: Response) => {
            try {
                const totalUsers = await usersCollection.countDocuments({
                    role: { $ne: "admin" },
                });

                const totalCourses = await courseCollection.countDocuments();
                const totalEnrollments = await enrollmentCollection.countDocuments();

                const categoryStats = await courseCollection
                    .aggregate([{ $group: { _id: "$category", value: { $sum: 1 } } }])
                    .toArray();

                const coursesByCategory = categoryStats.map((item) => ({
                    category: item._id,
                    value: item.value,
                }));

                res.send({
                    totalUsers,
                    totalCourses,
                    totalEnrollments,
                    coursesByCategory,
                });
            } catch (err) {
                console.error(err);
                res.status(500).send({ message: "Failed to load dashboard" });
            }
        }
    );

    // ============================
    // AI MENTOR
    // ============================

    app.get("/api/ai-mentor/sessions", verifyToken,
        async (req: AuthenticatedRequest, res: Response) => {
            const email = req.user?.email;

            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }

            const sessions = await mentorSessionCollection
                .find({ userEmail: email })
                .sort({ updatedAt: -1 })
                .toArray();

            res.send(sessions);
        }
    );

    app.post("/api/ai-mentor/sessions", verifyToken,
        async (req: AuthenticatedRequest, res: Response) => {
            const email = req.user?.email;

            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }

            const now = new Date();

            const result = await mentorSessionCollection.insertOne({
                userEmail: email,
                title: "New conversation",
                messages: [],
                createdAt: now,
                updatedAt: now,
            });

            res.send(result);
        }
    );

    app.get("/api/ai-mentor/sessions/:sessionId", verifyToken,
        async (req: AuthenticatedRequest, res: Response) => {
            const { sessionId } = req.params;

            const session = await mentorSessionCollection.findOne({
                _id: new ObjectId(sessionId as string),
                userEmail: req.user?.email,
            });

            if (!session) {
                res.status(404).send({ message: "Session not found" });
                return;
            }

            res.send(session);
        }
    );

    app.delete("/api/ai-mentor/sessions/:sessionId", verifyToken,
        async (req: AuthenticatedRequest, res: Response) => {
            const { sessionId } = req.params;

            const result = await mentorSessionCollection.deleteOne({
                _id: new ObjectId(sessionId as string),
                userEmail: req.user?.email,
            });

            res.send(result);
        }
    );

    app.post("/api/ai-mentor/sessions/:sessionId/messages", verifyToken,
    async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { sessionId } = req.params;
            const { message } = req.body as { message: string };

            if (!message) {
                res.status(400).send({ message: "Message is required" });
                return;
            }

            const session = await mentorSessionCollection.findOne({
                _id: new ObjectId(sessionId as string),
                userEmail: req.user?.email,
            });

            if (!session) {
                res.status(404).send({ message: "Session not found" });
                return;
            }

            const userMessage: MentorMessage = {
                role: "user",
                content: message,
                createdAt: new Date(),
            };

            const updatedHistory = [...session.messages, userMessage];

            const reply = await getMentorReply(updatedHistory);

            const assistantMessage: MentorMessage = {
                role: "assistant",
                content: reply,
                createdAt: new Date(),
            };

            const finalHistory = [...updatedHistory, assistantMessage];

            await mentorSessionCollection.updateOne(
                { _id: new ObjectId(sessionId as string) },
                {
                    $set: {
                        messages: finalHistory,
                        updatedAt: new Date(),
                        ...(session.messages.length === 0
                            ? { title: message.slice(0, 50) }
                            : {}),
                    },
                }
            );

            res.send({ reply: assistantMessage });
        } catch (error: any) {
            console.error(error);

            if (error.message === "QUOTA_EXCEEDED") {
                res.status(429).send({
                    message: "Daily AI mentor limit reached. Please try again tomorrow.",
                });
                return;
            }

            res.status(500).send({ message: "Failed to get mentor reply" });
        }
    }
);

    // ============================
    // HEALTH / ROOT
    // ============================

    app.get("/health", (req: Request, res: Response) => {
        res.send({ status: "ok" });
    });

    app.get("/", (req: Request, res: Response) => {
        res.send("SkillForge server is running!");
    });

    app.use((req: Request, res: Response) => {
        res.status(404).send({ message: "Route not found" });
    });

    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
    });

    console.log("✅ Connected to MongoDB successfully!");

    app.listen(port, () => {
        console.log(`🚀 SkillForge app listening on port ${port}`);
    });
}

run().catch(console.error);