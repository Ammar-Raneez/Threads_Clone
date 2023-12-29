import mongoose from "mongoose";

const threadSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  community: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "community",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  parentId: {
    type: String,
  },
  // a thread can have more threads
  children: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "thread",
    },
  ],
});

const Thread = mongoose.models.thread || mongoose.model("thread", threadSchema);

export default Thread;