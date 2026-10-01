import type { Request, Response } from "express";
import * as UserService from "../services/user.service";
import type { UserRole } from "../types/models";

export async function createUser(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const { name, role } = req.body as { name: string; role?: UserRole };
    const allowed: UserRole[] = ["student", "instructor"];
    const resolvedRole: UserRole =
      role && allowed.includes(role) ? role : "student";

    const user = await UserService.upsertUserOnSignup(email, name, resolvedRole);
    res.send(user);
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Failed to create user" });
  }
}