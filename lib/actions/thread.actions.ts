"use server";

import { revalidatePath } from "next/cache";

import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

export async function fetchPosts(pageNumber = 1, pageSize = 20) {
  connectToDB();
  const skipAmount = (pageNumber - 1) * pageSize;

  // limit and paginate
  const postsQuery = Thread.find({ parentId: { $in: [null, undefined] } })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: "author", model: User }) // populate author with the user document itself
    .populate({
      path: "children",
      populate: {
        path: "author",
        model: User,
        select: "_id name parentId image",
      },
    });

  // how many are there in total
  const totalPosts = await Thread.countDocuments({
    parentId: { $in: [null, undefined] },
  });

  const posts = await postsQuery.exec();
  const hasNext = totalPosts > skipAmount + posts.length;
  return { posts, hasNext };
}

interface CreateThreadParams {
  text: string;
  author: string;
  communityId: string | null;
  path: string;
}

export async function createThread({
  text,
  author,
  communityId,
  path,
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
}
