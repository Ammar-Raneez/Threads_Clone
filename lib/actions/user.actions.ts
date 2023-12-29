"use server";

import { revalidatePath } from "next/cache";

import { connectToDB } from "../mongoose";
import User from "../models/user.model";

export async function fetchUser(userId: string) {
  try {
    connectToDB();
    return User.findOne({ id: userId });
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed to fetch user: ${error.message}`);
  }
}

interface UpdateUserParams {
  userId: string;
  username: string;
  name: string;
  bio: string;
  image: string;
  path: string;
};

export async function updateUser({
  userId,
  username,
  name,
  bio,
  image,
  path,
}: UpdateUserParams): Promise<void> {
  try {
    connectToDB();
    await User.findOneAndUpdate(
      { id: userId },
      {
        username: username.toLowerCase(),
        name,
        bio,
        image,
        onboarded: true,
      },
      { upsert: true }
    );

    if (path === "/profile/edit") revalidatePath(path);
  } catch (error) {
    if (error instanceof Error)
      throw new Error(`Failed to create/update user: ${error.message}`);
  }
}
