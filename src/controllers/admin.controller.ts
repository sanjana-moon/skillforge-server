import type { Request, Response } from "express";
import { ObjectId } from "mongodb";
import { courseCollection, enrollmentCollection } from "../config/db";
import * as UserService from "../services/user.service";
import * as StatsService from "../services/stats.service";
import type { ApprovalStatus, UserRole } from "../types/models";

export async function getPendingCourses(req: Request, res: Response) {
  try {
    const courses = await courseCollection
      .find({ approvalStatus: "pending" }, { projection: { content: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(courses);
  } catch {
    res.status(500).send({ message: "Failed to fetch pending courses." });
  }
}

export async function getAllCourses(req: Request, res: Response) {
  try {
    const { status } = req.query as { status?: string };
    const query: Record<string, unknown> = {};
    if (status && status !== "all") query.approvalStatus = status;

    const result = await courseCollection
      .find(query, { projection: { content: 0 } })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(result);
  } catch {
    res.status(500).send({ message: "Failed to fetch courses" });
  }
}

export async function updateCourseApproval(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { approvalStatus } = req.body as { approvalStatus: ApprovalStatus };
    if (!approvalStatus)
      return res.status(400).send({ message: "approvalStatus is required" });

    const result = await courseCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { approvalStatus } }
    );
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to update course" });
  }
}

export async function deleteCourse(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const result = await courseCollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).send({ message: "Course not found" });

    await enrollmentCollection.deleteMany({ courseId: id });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete course" });
  }
}

export async function getUsers(req: Request, res: Response) {
  try {
    const users = await UserService.listNonAdminUsers();
    res.send(users);
  } catch {
    res.status(500).send({ message: "Failed to fetch users" });
  }
}

export async function updateUserRole(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { role } = req.body as { role: UserRole };
    const allowed: UserRole[] = ["student", "instructor", "admin"];
    if (!allowed.includes(role))
      return res.status(400).send({ message: "Invalid role" });

    await UserService.updateUserRole(id, role);
    res.send({ success: true });
  } catch {
    res.status(500).send({ message: "Failed to update role" });
  }
}

export async function updateUserBlock(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const { isBlocked } = req.body as { isBlocked: boolean };
    await UserService.setUserBlocked(id, isBlocked);
    res.send({ success: true, isBlocked: !!isBlocked });
  } catch {
    res.status(500).send({ message: "Failed to update block status" });
  }
}

export async function deleteUser(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const result = await UserService.deleteUserById(id);
    if (result.deletedCount === 0)
      return res.status(404).send({ message: "User not found" });
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to delete user" });
  }
}

export async function getDashboard(req: Request, res: Response) {
  try {
    const stats = await StatsService.getAdminDashboard();
    res.send(stats);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to load dashboard" });
  }
}