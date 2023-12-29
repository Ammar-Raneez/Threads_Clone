
"use server";

import { revalidatePath } from "next/cache";

import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

interface CreateThreadParams {
  text: string,
  author: string,
  communityId: string | null,
  path: string,
}

export async function createThread ({
  text,
  author,
  communityId,
  path
}: CreateThreadParams) {
  try {
    connectToDB();

    const createdThread = await Thread.create({
      text,
      author,
      community: null,
    });

    await User.findByIdAndUpdate(author, {
      $addToSet: { threads: createdThread._id },
    });

    revalidatePath(path);
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed to create thread: ${error.message}`);
  }
};
