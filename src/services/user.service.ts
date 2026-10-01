import { ObjectId } from "mongodb";
import { usersCollection } from "../config/db";
import type { AppUser, UserRole } from "../types/models";

export async function findUserByEmail(email: string) {
  return usersCollection.findOne({ email });
}

export async function upsertUserOnSignup(
  email: string,
  name: string,
  role: UserRole
) {
  const existing = await usersCollection.findOne({ email });

  if (existing) {
    if (existing.role === undefined || existing.isBlocked === undefined) {
      await usersCollection.updateOne(
        { email },
        {
          $set: {
            role: existing.role ?? role,
            isBlocked: existing.isBlocked ?? false,
          },
        }
      );
      return usersCollection.findOne({ email });
    }
    return existing;
  }

  const newUser: AppUser = {
    name,
    email,
    role,
    isBlocked: false,
  };

  const result = await usersCollection.insertOne(newUser);
  return { ...newUser, _id: result.insertedId };
}

export async function listNonAdminUsers() {
  return usersCollection
    .find({ role: { $ne: "admin" } })
    .sort({ name: 1 })
    .toArray();
}

export async function updateUserRole(id: string, role: UserRole) {
  await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { role } }
  );
}

export async function setUserBlocked(id: string, isBlocked: boolean) {
  await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { isBlocked: !!isBlocked } }
  );
}

export async function deleteUserById(id: string) {
  return usersCollection.deleteOne({ _id: new ObjectId(id) });
}