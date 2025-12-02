const mongoose = require("mongoose");

const footEntrySchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId },
  footfall: { type: Number, required: true },
  conversion: { type: Number, required: true },
  timestamp: { type: Date, required: true },
});

const footfallSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  user_id: { type: String, required: true, unique: true },
  foot_entry: { type: [footEntrySchema], default: [] },
});

module.exports = mongoose.model("Footfall", footfallSchema);
