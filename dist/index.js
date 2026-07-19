"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const genai_1 = require("@google/genai");
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const mongodb_1 = require("mongodb");
const jose_1 = require("jose");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 5000;
app.use((0, cors_1.default)({
    origin: process.env.CLIENT_URL,
    credentials: true,
}));
app.use(express_1.default.json());
const uri = process.env.MONGO_URI;
const ai = new genai_1.GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
});
const client = new mongodb_1.MongoClient(uri, {
    serverApi: {
        version: mongodb_1.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});
const JWKS = (0, jose_1.createRemoteJWKSet)(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`), {
    timeoutDuration: 10000,
    cooldownDuration: 30000,
});
// ============================
// AI MENTOR
// ============================
async function getMentorReply(history) {
    const conversation = history.map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
    }));
    const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: conversation,
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
    return (response.text ??
        "Sorry, I couldn't generate a response right now.");
}
async function run() {
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    const db = client.db("skillforge");
    const courseCollection = db.collection("courses");
    const enrollmentCollection = db.collection("enrollments");
    const paymentCollection = db.collection("payments");
    const usersCollection = db.collection("user");
    const mentorSessionCollection = db.collection("mentorSessions");
    await enrollmentCollection.createIndex({ studentEmail: 1, courseId: 1 }, { unique: true });
    await courseCollection.createIndex({ instructorEmail: 1 });
    await courseCollection.createIndex({ approvalStatus: 1, publishStatus: 1 });
    await mentorSessionCollection.createIndex({ userEmail: 1 });
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await paymentCollection.createIndex({ transactionId: 1 }, { unique: true });
    // ============================
    // AUTH MIDDLEWARE (FIXED)
    // ============================
    const verifyToken = async (req, res, next) => {
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
            const { payload } = await (0, jose_1.jwtVerify)(token, JWKS);
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
                    const newUser = {
                        name: payload.name || email.split('@')[0],
                        email: email.toLowerCase(),
                        role: "student",
                        isBlocked: false,
                        profileImage: payload.image || null,
                    };
                    await usersCollection.insertOne(newUser);
                    console.log(`✅ Auto-created user: ${email}`);
                }
            }
            next();
        }
        catch (error) {
            console.error("Token verification error:", error);
            res.status(403).json({ message: "Forbidden" });
        }
    };
    const requireRole = (...roles) => {
        return async (req, res, next) => {
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
                    const newUser = {
                        name: req.user?.name || email.split('@')[0],
                        email: email.toLowerCase(),
                        role: "student",
                        isBlocked: false,
                        profileImage: req.user?.image || null,
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
            }
            catch (error) {
                console.error("requireRole error:", error);
                res.status(500).send({ message: "Internal server error" });
            }
        };
    };
    const requireSelf = (paramName) => {
        return (req, res, next) => {
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
    app.post("/api/users", verifyToken, async (req, res) => {
        try {
            const email = req.user?.email;
            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }
            const { name, role } = req.body;
            const allowedRoles = ["student", "instructor"];
            const resolvedRole = role && allowedRoles.includes(role) ? role : "student";
            const existing = await usersCollection.findOne({ email });
            if (existing) {
                if (existing.role === undefined || existing.isBlocked === undefined) {
                    await usersCollection.updateOne({ email }, {
                        $set: {
                            role: existing.role ?? resolvedRole,
                            isBlocked: existing.isBlocked ?? false,
                        },
                    });
                    const patched = await usersCollection.findOne({ email });
                    res.send(patched);
                    return;
                }
                res.send(existing);
                return;
            }
            const newUser = {
                name,
                email,
                role: resolvedRole,
                isBlocked: false,
            };
            const result = await usersCollection.insertOne(newUser);
            res.send({ ...newUser, _id: result.insertedId });
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to create user" });
        }
    });
    // ============================
    // COURSES (public listing)
    // ============================
    app.get("/api/courses", async (req, res) => {
        try {
            const { search = "", category, level, minPrice, maxPrice, sort, page = "1", limit = "8", } = req.query;
            const currentPage = Number(page);
            const pageSize = Number(limit);
            const query = {
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
                const priceQuery = {};
                if (minPrice)
                    priceQuery.$gte = Number(minPrice);
                if (maxPrice)
                    priceQuery.$lte = Number(maxPrice);
                query.price = priceQuery;
            }
            let sortOption = {};
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
        }
        catch (error) {
            res.status(500).send({ message: "Failed to fetch courses" });
        }
    });
    app.get("/api/courses/featured", async (req, res) => {
        try {
            const courses = await courseCollection
                .find({ approvalStatus: "approved", publishStatus: "published" })
                .sort({ enrollmentCount: -1, createdAt: -1 })
                .limit(8)
                .toArray();
            res.send(courses);
        }
        catch (error) {
            res.status(500).send({ message: "Failed to fetch featured courses" });
        }
    });
    app.get("/api/categories", async (req, res) => {
        try {
            const categories = await courseCollection.distinct("category", {
                approvalStatus: "approved",
                publishStatus: "published",
            });
            res.send(categories);
        }
        catch (error) {
            res.status(500).send({ message: "Failed to fetch categories" });
        }
    });
    // ============================
    // INSTRUCTOR COURSE ROUTES
    // ============================
    app.get("/api/courses/instructor/:email", verifyToken, requireRole("instructor"), requireSelf("email"), async (req, res) => {
        const email = req.params.email;
        const result = await courseCollection
            .find({ instructorEmail: email })
            .sort({ createdAt: -1 })
            .toArray();
        res.send(result);
    });
    app.post("/api/courses", verifyToken, requireRole("instructor"), async (req, res) => {
        const data = req.body;
        const result = await courseCollection.insertOne({
            ...data,
            instructorEmail: req.user.email,
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
    });
    app.patch("/api/courses/:id", verifyToken, requireRole("instructor"), async (req, res) => {
        try {
            const { id } = req.params;
            const updatedData = req.body;
            const course = await courseCollection.findOne({
                _id: new mongodb_1.ObjectId(id),
            });
            if (!course) {
                res.status(404).send({ message: "Course not found" });
                return;
            }
            if (course.instructorEmail !== req.user?.email) {
                res.status(403).send({ message: "Not authorized to update this course" });
                return;
            }
            const result = await courseCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, {
                $set: {
                    ...updatedData,
                    price: Number(updatedData.price),
                },
            });
            res.send(result);
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to update course" });
        }
    });
    // ============================
    // PUBLISH/UNPUBLISH COURSE (Instructor & Admin)
    // ============================
    app.patch("/api/courses/:id/publish", verifyToken, requireRole("instructor", "admin"), async (req, res) => {
        try {
            const { id } = req.params;
            const { publishStatus } = req.body;
            if (!publishStatus) {
                res.status(400).send({ message: "publishStatus is required" });
                return;
            }
            const course = await courseCollection.findOne({
                _id: new mongodb_1.ObjectId(id),
            });
            if (!course) {
                res.status(404).send({ message: "Course not found" });
                return;
            }
            if (course.instructorEmail !== req.user?.email && req.user?.role !== "admin") {
                res.status(403).send({ message: "Not authorized to update this course" });
                return;
            }
            await courseCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { publishStatus } });
            res.send({
                success: true,
                publishStatus,
                message: `Course ${publishStatus === "published" ? "published" : "unpublished"} successfully`
            });
        }
        catch (err) {
            console.error("Publish error:", err);
            res.status(500).send({ message: "Failed to update publish status." });
        }
    });
    app.delete("/api/courses/:id", verifyToken, requireRole("instructor"), async (req, res) => {
        const { id } = req.params;
        const course = await courseCollection.findOne({ _id: new mongodb_1.ObjectId(id) });
        if (!course) {
            res.status(404).send({ message: "Course not found" });
            return;
        }
        if (course.instructorEmail !== req.user?.email) {
            res.status(403).send({ message: "Not authorized to delete this course" });
            return;
        }
        const result = await courseCollection.deleteOne({ _id: new mongodb_1.ObjectId(id) });
        await enrollmentCollection.deleteMany({ courseId: id });
        res.send(result);
    });
    // wildcard :id last among /api/courses/* routes
    app.get("/api/courses/:id", async (req, res) => {
        try {
            const { id } = req.params;
            const result = await courseCollection.findOne({
                _id: new mongodb_1.ObjectId(id),
            });
            if (!result) {
                res.status(404).send({ message: "Course not found" });
                return;
            }
            res.send(result);
        }
        catch (error) {
            console.error("Error fetching course:", error);
            res.status(500).send({ message: "Failed to fetch course" });
        }
    });
    // ============================
    // INSTRUCTOR DASHBOARD
    // ============================
    app.get("/api/instructor-stats/:email", verifyToken, requireRole("instructor"), requireSelf("email"), async (req, res) => {
        try {
            const { email } = req.params;
            const courses = await courseCollection
                .find({ instructorEmail: email })
                .toArray();
            const totalCourses = courses.length;
            const courseIds = courses.map((c) => c._id.toString());
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
            const monthlyEnrollments = {};
            enrollments.forEach((e) => {
                const date = new Date(e.createdAt);
                const month = date.toLocaleString("default", { month: "short" });
                if (!monthlyEnrollments[month]) {
                    monthlyEnrollments[month] = 0;
                }
                monthlyEnrollments[month] += 1;
            });
            const enrollmentChart = Object.entries(monthlyEnrollments).map(([month, count]) => ({ month, enrollments: count }));
            res.send({
                totalCourses,
                totalStudents,
                popularCourses,
                enrollmentChart,
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to load instructor dashboard stats" });
        }
    });
    // ============================
    // ENROLLMENTS
    // ============================
    app.post("/api/enrollments", verifyToken, requireRole("student"), async (req, res) => {
        try {
            const { courseId, courseTitle } = req.body;
            const studentEmail = req.user.email;
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
            await courseCollection.updateOne({ _id: new mongodb_1.ObjectId(courseId) }, {
                $inc: {
                    enrollmentCount: 1,
                },
            });
            res.send({
                success: true,
                enrollment: result,
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).send({
                message: "Failed to enroll in course",
            });
        }
    });
    app.get("/api/enrollments/student/:email", verifyToken, requireRole("student"), requireSelf("email"), async (req, res) => {
        const email = req.params.email;
        const result = await enrollmentCollection
            .find({ studentEmail: email })
            .sort({ createdAt: -1 })
            .toArray();
        res.send(result);
    });
    app.patch("/api/enrollments/:id/progress", verifyToken, requireRole("student"), async (req, res) => {
        try {
            const { id } = req.params;
            const { progress } = req.body;
            const enrollment = await enrollmentCollection.findOne({
                _id: new mongodb_1.ObjectId(id),
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
            const result = await enrollmentCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, {
                $set: {
                    progress: clamped,
                    ...(clamped === 100 ? { completedAt: new Date() } : {}),
                },
            });
            res.send(result);
        }
        catch (error) {
            res.status(500).send({ message: "Failed to update progress" });
        }
    });
    app.get("/api/enrollments/check/:courseId", verifyToken, async (req, res) => {
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
        }
        catch (error) {
            console.error("Check enrollment error:", error);
            res.status(500).send({ message: "Failed to check enrollment" });
        }
    });
    // GET user's all enrollments
    app.get("/api/enrollments/my", verifyToken, async (req, res) => {
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
        }
        catch (error) {
            console.error("Get user enrollments error:", error);
            res.status(500).send({ message: "Failed to fetch enrollments" });
        }
    });
    // ============================
    // ✅ CHECKOUT - Store enrollment & payment in MongoDB
    // ============================
    app.post("/api/checkout", verifyToken, requireRole("student"), async (req, res) => {
        try {
            const { courseId, transactionId, paymentStatus } = req.body;
            const studentEmail = req.user.email;
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
                _id: new mongodb_1.ObjectId(courseId),
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
            await courseCollection.updateOne({ _id: new mongodb_1.ObjectId(courseId) }, {
                $inc: {
                    enrollmentCount: 1,
                },
            });
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
        }
        catch (error) {
            console.error("Checkout error:", error);
            res.status(500).send({
                success: false,
                message: "Checkout failed",
            });
        }
    });
    // ============================
    // STUDENT DASHBOARD
    // ============================
    app.get("/api/student-stats/:email", verifyToken, requireRole("student"), requireSelf("email"), async (req, res) => {
        try {
            const { email } = req.params;
            const enrollments = await enrollmentCollection
                .find({ studentEmail: email })
                .toArray();
            const enrolledCourses = enrollments.length;
            const completedCourses = enrollments.filter((e) => e.progress === 100).length;
            const inProgress = enrollments.filter((e) => e.progress > 0 && e.progress < 100).length;
            const recentCourses = enrollments
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 5);
            res.send({
                enrolledCourses,
                completedCourses,
                inProgress,
                recentCourses,
            });
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to load student dashboard" });
        }
    });
    // ============================
    // PROFILE
    // ============================
    app.get("/api/profile", verifyToken, async (req, res) => {
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
        }
        catch (error) {
            console.error("Error fetching profile:", error);
            res.status(500).send({ message: "Failed to load profile" });
        }
    });
    app.put("/api/profile", verifyToken, async (req, res) => {
        try {
            const email = req.user?.email;
            if (!email) {
                res.status(401).send({ message: "Unauthorized" });
                return;
            }
            const { name, email: newEmail, profileImage } = req.body;
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
            const updateData = { name };
            if (emailChanging) {
                updateData.email = newEmail;
            }
            if (profileImage !== undefined) {
                updateData.profileImage = profileImage;
            }
            const result = await usersCollection.updateOne({ email }, { $set: updateData });
            if (result.matchedCount === 0) {
                res.status(404).send({ message: "User not found" });
                return;
            }
            if (emailChanging) {
                await courseCollection.updateMany({ instructorEmail: email }, { $set: { instructorEmail: newEmail } });
                await enrollmentCollection.updateMany({ studentEmail: email }, { $set: { studentEmail: newEmail } });
                await mentorSessionCollection.updateMany({ userEmail: email }, { $set: { userEmail: newEmail } });
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
        }
        catch (error) {
            console.error("Profile update error:", error);
            res.status(500).send({ message: "Failed to update profile" });
        }
    });
    // ============================
    // ADMIN
    // ============================
    app.get("/api/admin/pending-courses", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const courses = await courseCollection
                .find({ approvalStatus: "pending" })
                .sort({ createdAt: -1 })
                .toArray();
            res.send(courses);
        }
        catch (err) {
            res.status(500).send({ message: "Failed to fetch pending courses." });
        }
    });
    app.get("/api/admin/courses", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const { status } = req.query;
            const query = {};
            if (status && status !== "all") {
                query.approvalStatus = status;
            }
            const result = await courseCollection
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();
            res.send(result);
        }
        catch (error) {
            res.status(500).send({ message: "Failed to fetch courses" });
        }
    });
    app.patch("/api/admin/courses/:id", verifyToken, requireRole("admin"), async (req, res) => {
        const id = req.params.id;
        const { approvalStatus } = req.body;
        if (!approvalStatus) {
            res.status(400).send({ message: "approvalStatus is required" });
            return;
        }
        const result = await courseCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { approvalStatus } });
        res.send(result);
    });
    app.delete("/api/admin/courses/:id", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const id = req.params.id;
            const result = await courseCollection.deleteOne({
                _id: new mongodb_1.ObjectId(id),
            });
            if (result.deletedCount === 0) {
                res.status(404).send({ message: "Course not found" });
                return;
            }
            await enrollmentCollection.deleteMany({ courseId: id });
            res.send(result);
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to delete course" });
        }
    });
    app.get("/api/admin/users", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const users = await usersCollection
                .find({ role: { $ne: "admin" } })
                .sort({ name: 1 })
                .toArray();
            res.send(users);
        }
        catch (err) {
            res.status(500).send({ message: "Failed to fetch users" });
        }
    });
    app.patch("/api/admin/users/:id/role", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const { id } = req.params;
            const { role } = req.body;
            const allowedRoles = ["student", "instructor", "admin"];
            if (!allowedRoles.includes(role)) {
                res.status(400).send({ message: "Invalid role" });
                return;
            }
            await usersCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { role } });
            res.send({ success: true });
        }
        catch (err) {
            res.status(500).send({ message: "Failed to update role" });
        }
    });
    app.patch("/api/admin/users/:id/block", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const { id } = req.params;
            const { isBlocked } = req.body;
            await usersCollection.updateOne({ _id: new mongodb_1.ObjectId(id) }, { $set: { isBlocked: !!isBlocked } });
            res.send({ success: true, isBlocked: !!isBlocked });
        }
        catch (err) {
            res.status(500).send({ message: "Failed to update block status" });
        }
    });
    app.delete("/api/admin/users/:id", verifyToken, requireRole("admin"), async (req, res) => {
        try {
            const id = req.params.id;
            const result = await usersCollection.deleteOne({
                _id: new mongodb_1.ObjectId(id),
            });
            if (result.deletedCount === 0) {
                res.status(404).send({ message: "User not found" });
                return;
            }
            res.send(result);
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to delete user" });
        }
    });
    app.get("/api/admin/dashboard", verifyToken, requireRole("admin"), async (req, res) => {
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
        }
        catch (err) {
            console.error(err);
            res.status(500).send({ message: "Failed to load dashboard" });
        }
    });
    // ============================
    // AI MENTOR
    // ============================
    app.get("/api/ai-mentor/sessions", verifyToken, async (req, res) => {
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
    });
    app.post("/api/ai-mentor/sessions", verifyToken, async (req, res) => {
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
    });
    app.get("/api/ai-mentor/sessions/:sessionId", verifyToken, async (req, res) => {
        const { sessionId } = req.params;
        const session = await mentorSessionCollection.findOne({
            _id: new mongodb_1.ObjectId(sessionId),
            userEmail: req.user?.email,
        });
        if (!session) {
            res.status(404).send({ message: "Session not found" });
            return;
        }
        res.send(session);
    });
    app.delete("/api/ai-mentor/sessions/:sessionId", verifyToken, async (req, res) => {
        const { sessionId } = req.params;
        const result = await mentorSessionCollection.deleteOne({
            _id: new mongodb_1.ObjectId(sessionId),
            userEmail: req.user?.email,
        });
        res.send(result);
    });
    app.post("/api/ai-mentor/sessions/:sessionId/messages", verifyToken, async (req, res) => {
        try {
            const { sessionId } = req.params;
            const { message } = req.body;
            if (!message) {
                res.status(400).send({ message: "Message is required" });
                return;
            }
            const session = await mentorSessionCollection.findOne({
                _id: new mongodb_1.ObjectId(sessionId),
                userEmail: req.user?.email,
            });
            if (!session) {
                res.status(404).send({ message: "Session not found" });
                return;
            }
            const userMessage = {
                role: "user",
                content: message,
                createdAt: new Date(),
            };
            const updatedHistory = [...session.messages, userMessage];
            const reply = await getMentorReply(updatedHistory);
            const assistantMessage = {
                role: "assistant",
                content: reply,
                createdAt: new Date(),
            };
            const finalHistory = [...updatedHistory, assistantMessage];
            await mentorSessionCollection.updateOne({ _id: new mongodb_1.ObjectId(sessionId) }, {
                $set: {
                    messages: finalHistory,
                    updatedAt: new Date(),
                    ...(session.messages.length === 0
                        ? { title: message.slice(0, 50) }
                        : {}),
                },
            });
            res.send({ reply: assistantMessage });
        }
        catch (error) {
            console.error(error);
            res.status(500).send({ message: "Failed to get mentor reply" });
        }
    });
    // ============================
    // HEALTH / ROOT
    // ============================
    app.get("/health", (req, res) => {
        res.send({ status: "ok" });
    });
    app.get("/", (req, res) => {
        res.send("SkillForge server is running!");
    });
    app.use((req, res) => {
        res.status(404).send({ message: "Route not found" });
    });
    app.use((err, req, res, next) => {
        console.error(err);
        res.status(500).send({ message: "Internal server error" });
    });
    console.log("✅ Connected to MongoDB successfully!");
    app.listen(port, () => {
        console.log(`🚀 SkillForge app listening on port ${port}`);
    });
}
run().catch(console.error);
//# sourceMappingURL=index.js.map