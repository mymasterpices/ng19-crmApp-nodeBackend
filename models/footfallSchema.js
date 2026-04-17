const mongoose = require("mongoose");

const footEntrySchema = new mongoose.Schema({
  footfall: { type: Number, required: true },
  conversion: { type: Number, required: true },
  pc: { type: String },
  timestamp: { type: Date, required: true },
});

const footfallSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true },
    user_id: { type: String },
    user_status: { type: String },
    foot_entry: { type: [footEntrySchema], default: [] },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Footfall", footfallSchema);
