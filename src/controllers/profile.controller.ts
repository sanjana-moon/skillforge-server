import type { Request, Response } from "express";
import * as ProfileService from "../services/profile.service";

export async function getProfile(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const user = await ProfileService.getProfile(email);
    if (!user) return res.status(404).send({ message: "User not found" });

    res.send({
      name: user.name,
      email: user.email,
      role: user.role,
      profileImage: user.profileImage || null,
    });
  } catch (err) {
    console.error("Error fetching profile:", err);
    res.status(500).send({ message: "Failed to load profile" });
  }
}

export async function updateProfile(req: Request, res: Response) {
  try {
    const email = req.user?.email;
    if (!email) return res.status(401).send({ message: "Unauthorized" });

    const { name, email: newEmail, profileImage } = req.body as {
      name: string;
      email?: string;
      profileImage?: string;
    };

    if (!name) return res.status(400).send({ message: "Name is required" });

    const updated = await ProfileService.updateProfile(email, {
      name,
      email: newEmail,
      profileImage,
    });

    if (!updated) return res.status(404).send({ message: "User not found" });

    res.send({
      name: updated.name,
      email: updated.email,
      role: updated.role,
      profileImage: updated.profileImage || null,
    });
  } catch (err: any) {
    if (err.message === "EMAIL_IN_USE") {
      return res
        .status(400)
        .send({ message: "Email already in use by another account" });
    }
    console.error("Profile update error:", err);
    res.status(500).send({ message: "Failed to update profile" });
  }
}