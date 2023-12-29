"use server";

import { revalidatePath } from "next/cache";

import Thread from "../models/thread.model";
import User from "../models/user.model";
import { connectToDB } from "../mongoose";

export async function fetchPosts(pageNumber = 1, pageSize = 10) {
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

export async function fetchThreadById(id: string) {
  connectToDB();

  try {
    const thread = await Thread.findById(id)
      .populate({
        path: "author",
        model: User,
        select: "_id id name image",
      })
      .populate({
        path: "children", // populate comments of parent thread
        populate: [
          {
            path: "author", // populate authors of comments of parent thread
            model: User,
            select: "_id name parentId image",
          },
          {
            path: "children", // populate comments of children threads
            model: Thread,
            populate: {
              path: "author",
              model: User,
              select: "_id name parentId image",
            },
          },
        ],
      })
      .exec();

    return thread;
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed to fetch thread: ${error.message}`);
  }
}

interface AddCommentParams {
  threadId: string;
  text: string;
  userId: string;
  path: string;
}

export async function addCommentToThread({
  threadId,
  text,
  userId,
  path,
}: AddCommentParams) {
  try {
    const parentThread = await Thread.findById(threadId);
    if (!parentThread) throw new Error("Could not find thread");

    const comment = new Thread({
      text,
      author: userId,
      parentId: threadId,
    });

    // update parent thread with comment
    const savedComment = await comment.save();
    parentThread.children.push(savedComment._id);
    await parentThread.save();
    revalidatePath(path);
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed to add comment to thread: ${error.message}`);
  }
}
