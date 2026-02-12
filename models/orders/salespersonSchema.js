const monsoose = require("mongoose");

// Salesperson Schema
const SalespersonSchema = new monsoose.Schema({
  name: { type: String, required: true, unique: true },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = monsoose.model("Salesperson", SalespersonSchema);
