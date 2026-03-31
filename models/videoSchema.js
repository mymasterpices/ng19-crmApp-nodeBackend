const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  tagNumber: {
    type: String,
    unique: true, // Enforce uniqueness
  },
  videoUpload: {
    type: String, // Store file path or URL
    required: true,
  },
  category: {
    type: String,
    required: true,
  },
  tags: {
    type: [],
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true, // Prevent modification
  },
});

const Video = mongoose.model("Video", videoSchema);

module.exports = Video;
