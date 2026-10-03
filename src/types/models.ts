import type { ObjectId } from "mongodb";

export type ApprovalStatus = "pending" | "approved" | "rejected";
export type PublishStatus = "published" | "unpublished";
export type UserRole = "student" | "instructor" | "admin";
export type CourseLevel = "beginner" | "intermediate" | "advanced";

export interface Course {
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

export interface Enrollment {
  _id?: ObjectId;
  courseId: string;
  courseTitle: string;
  studentEmail: string;
  studentName: string;
  progress: number;
  completedAt?: Date;
  createdAt: Date;
}

export interface Payment {
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

export interface AppUser {
  _id?: ObjectId;
  name: string;
  email: string;
  role: UserRole;
  isBlocked: boolean;
  profileImage?: string | null;
}

export interface MentorMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface MentorSession {
  _id?: ObjectId;
  userEmail: string;
  title: string;
  messages: MentorMessage[];
  createdAt: Date;
  updatedAt: Date;
}