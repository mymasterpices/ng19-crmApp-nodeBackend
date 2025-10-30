const mongoose = require("mongoose");

const sharelinkSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
  },
  videoIds: {
    type: [Array], // Array of strings to store video IDs
    required: true,
  },
  expiryDate: {
    type: Date,
    required: true,
  },
  customerName: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

const shareLink = mongoose.model("sharelink", sharelinkSchema);

module.exports = shareLink;
