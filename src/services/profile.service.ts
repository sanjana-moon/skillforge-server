import { usersCollection, courseCollection, enrollmentCollection, mentorSessionCollection } from "../config/db.js";
import type { AppUser } from "../types/models";

export async function getProfile(email: string) {
  return usersCollection.findOne({ email });
}

export async function updateProfile(
  currentEmail: string,
  data: { name: string; email?: string; profileImage?: string }
) {
  const { name, email: newEmail, profileImage } = data;

  const emailChanging = !!newEmail && newEmail !== currentEmail;

  if (emailChanging) {
    const existing = await usersCollection.findOne({ email: newEmail });
    if (existing) {
      throw new Error("EMAIL_IN_USE");
    }
  }

  const updateData: Partial<AppUser> = { name };
  if (emailChanging) updateData.email = newEmail;
  if (profileImage !== undefined) updateData.profileImage = profileImage;

  const result = await usersCollection.updateOne(
    { email: currentEmail },
    { $set: updateData }
  );

  if (result.matchedCount === 0) return null;

  if (emailChanging) {
    await courseCollection.updateMany(
      { instructorEmail: currentEmail },
      { $set: { instructorEmail: newEmail! } }
    );
    await enrollmentCollection.updateMany(
      { studentEmail: currentEmail },
      { $set: { studentEmail: newEmail! } }
    );
    await mentorSessionCollection.updateMany(
      { userEmail: currentEmail },
      { $set: { userEmail: newEmail! } }
    );
  }

  return usersCollection.findOne({ email: newEmail || currentEmail });
}