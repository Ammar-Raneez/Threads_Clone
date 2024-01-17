"use server";

import { revalidatePath } from "next/cache";

import Thread from "@/lib/models/thread.model";
import User from "@/lib/models/user.model";
import Community from "@/lib/models/community.model";
import { connectToDB } from "@/lib/mongoose";

export async function fetchPosts(pageNumber = 1, pageSize = 10) {
  connectToDB();
  const skipAmount = (pageNumber - 1) * pageSize;

  // limit and paginate
  const postsQuery = Thread.find({ parentId: { $in: [null, undefined] } })
    .sort({ createdAt: "desc" })
    .skip(skipAmount)
    .limit(pageSize)
    .populate({ path: "author", model: User }) // populate author with the user document itself
    .populate({ path: "community", model: Community }) // populate community with the community document itself
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

    const communityIdObject = await Community.findOne(
      { id: communityId },
      { _id: 1 }
    );

    const createdThread = await Thread.create({
      text,
      author,
      community: communityIdObject,
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
        path: "community",
        model: Community,
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

async function fetchAllChildThreads(threadId: string): Promise<any[]> {
  const childThreads = await Thread.find({ parentId: threadId });

  const descendantThreads = [];
  for (const childThread of childThreads) {
    const descendants = await fetchAllChildThreads(childThread._id);
    descendantThreads.push(childThread, ...descendants);
  }

  return descendantThreads;
}

export async function deleteThread(id: string, path: string): Promise<void> {
  try {
    connectToDB();

    // Find the thread to be deleted (the main thread)
    const mainThread = await Thread.findById(id).populate("author community");

    if (!mainThread) {
      throw new Error("Thread not found");
    }

    // Fetch all child threads and their descendants recursively
    const descendantThreads = await fetchAllChildThreads(id);

    // Get all descendant thread IDs including the main thread ID and child thread IDs
    const descendantThreadIds = [
      id,
      ...descendantThreads.map((thread) => thread._id),
    ];

    // Extract the authorIds and communityIds to update User and Community models respectively
    const uniqueAuthorIds = new Set(
      [
        ...descendantThreads.map((thread) => thread.author?._id?.toString()), // Use optional chaining to handle possible undefined values
        mainThread.author?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    const uniqueCommunityIds = new Set(
      [
        ...descendantThreads.map((thread) => thread.community?._id?.toString()), // Use optional chaining to handle possible undefined values
        mainThread.community?._id?.toString(),
      ].filter((id) => id !== undefined)
    );

    // Recursively delete child threads and their descendants
    await Thread.deleteMany({ _id: { $in: descendantThreadIds } });

    // Update User model
    await User.updateMany(
      { _id: { $in: Array.from(uniqueAuthorIds) } },
      { $pull: { threads: { $in: descendantThreadIds } } }
    );

    // Update Community model
    await Community.updateMany(
      { _id: { $in: Array.from(uniqueCommunityIds) } },
      { $pull: { threads: { $in: descendantThreadIds } } }
    );

    revalidatePath(path);
  } catch (error: any) {
    throw new Error(`Failed to delete thread: ${error.message}`);
  }
}
