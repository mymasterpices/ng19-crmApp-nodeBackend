const monsoose = require("mongoose");

// Category Schema
const CategorySchema = new monsoose.Schema({
  name: { type: String, required: true, unique: true },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = monsoose.model("Category", CategorySchema);
