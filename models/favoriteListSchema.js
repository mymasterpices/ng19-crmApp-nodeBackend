const mongoose = require("mongoose");

const favoriteListSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
  },
  favVideoIds: {
    type: [Array],
    required: true,
  },
  customerName: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
});

const FavoriteList = mongoose.model("favitelist", favoriteListSchema);

module.exports = FavoriteList;
