import type { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { JWKS } from "../config/jwks.js";
import { usersCollection } from "../config/db.js";

export async function verifyToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
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

    const email =
      typeof payload.email === "string"
        ? payload.email
        : typeof payload.sub === "string"
        ? payload.sub
        : undefined;

    req.user = { ...payload, email };

    if (email) {
      const lower = email.toLowerCase();
      await usersCollection.updateOne(
        { email: lower },
        {
          $setOnInsert: {
            name: (payload.name as string) || lower.split("@")[0],
            email: lower,
            role: "student",
            isBlocked: false,
            profileImage: (payload.image as string) || null,
          },
        },
        { upsert: true }
      );
    }

    next();
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(403).json({ message: "Forbidden" });
  }
}