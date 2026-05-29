const mongoose = require("mongoose");

// Karigar Schema
const KarigarSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Karigar", KarigarSchema);
