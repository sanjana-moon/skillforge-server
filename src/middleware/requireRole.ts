import type { Request, Response, NextFunction } from "express";
import { usersCollection } from "../config/db";
import type { UserRole } from "../types/models";

export function requireRole(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const email = req.user?.email;

      if (!email) {
        res.status(401).send({ message: "Unauthorized - No email" });
        return;
      }

      const user = await usersCollection.findOne({
        email: email.toLowerCase(),
      });

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
          message: `Forbidden - Required role: ${roles.join(", ")}`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error("requireRole error:", error);
      res.status(500).send({ message: "Internal server error" });
    }
  };
}