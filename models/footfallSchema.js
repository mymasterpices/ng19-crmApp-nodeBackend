const mongoose = require("mongoose");
const footEntrySchema = new mongoose.Schema({
  footfall: { type: Number, required: true },
  conversion: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now, immutable: true },
});

const footfallSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  user_id: { type: String, required: true, unique: true },
  foot_entry: { type: [footEntrySchema], default: [] },
});

// Check if model exists first
module.exports = mongoose.model("Footfall", footfallSchema);
