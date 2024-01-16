"use server";

import { revalidatePath } from "next/cache";
import { FilterQuery } from "mongoose";

import User from "@/lib/models/user.model";
import Thread from "@/lib/models/thread.model";
import { connectToDB } from "@/lib/mongoose";

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
}

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

export async function fetchUserPosts(userId: string) {
  try {
    connectToDB();
    const threads = await User.findOne({ id: userId }).populate({
      path: "threads",
      model: Thread,
      populate: [
        {
          path: "children",
          model: Thread,
          populate: {
            path: "author",
            model: User,
            select: "name image id",
          },
        },
      ],
    });

    return threads;
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed fetching user threads: ${error.message}`);
  }
}

interface FetchUsersParams {
  userId: string;
  pageNumber: number;
  pageSize: number;
  searchTerm?: string;
  sortBy?: "asc" | "desc";
}

export async function fetchUsers({
  userId,
  searchTerm = "",
  pageNumber = 1,
  pageSize = 10,
  sortBy = "desc",
}: FetchUsersParams) {
  try {
    connectToDB();
    const skipAmount = (pageNumber - 1) * pageSize;

    // everyone except current user
    const query: FilterQuery<typeof User> = {
      id: { $ne: userId },
    };

    if (searchTerm.trim() !== "") {
      query.$text = { $search: searchTerm };
    }

    const sortOptions = { createdAt: sortBy };
    const usersQuery = User.find(query)
      .sort(sortOptions)
      .skip(skipAmount)
      .limit(pageSize);

    const totalUserCount = await User.countDocuments(query);
    const users = await usersQuery.exec();
    const hasNext = totalUserCount > skipAmount + users.length;

    return { users, hasNext };
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed fetching users ${error.message}`);
  }
}

export async function getActivity(
  userId: string,
  pageNumber = 1,
  pageSize = 10
) {
  try {
    connectToDB();

    const userThreads = await Thread.find({ author: userId });
    const skipAmount = (pageNumber - 1) * pageSize;

    // get all comments of all user threads
    const commentIds = userThreads.reduce((acc, userThread) => {
      return acc.concat(userThread.children);
    }, []);

    // get comments excluding ones created by the user
    const query = {
      _id: { $in: commentIds },
      author: { $ne: userId },
    };

    const comments = await Thread.find(query)
      .skip(skipAmount)
      .limit(pageSize)
      .populate({
        path: "author",
        model: User,
        select: "_id name image",
      });

    const totalComments = await Thread.countDocuments(query);
    const hasNext = totalComments > skipAmount + comments.length;
    return { comments, hasNext }; 
  } catch (error: unknown) {
    if (error instanceof Error)
      throw new Error(`Failed fetching activities ${error.message}`);
  }
}
