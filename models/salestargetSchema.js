const mongoose = require("mongoose");

const salesTargetSchema = new mongoose.Schema(
  {
    // 1. Time Dimension
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
      default: () => new Date().getFullYear(),
    },

    // 2. The Goals (Targets set for the store)
    targets: {
      sales_amount: { type: Number, default: 0 },
      gold_weight: { type: Number, default: 0 }, // Target in grams
      diamond_weight: { type: Number, default: 0 }, // Target in carats
      stone_weight: { type: Number, default: 0 }, // Target in carats/grams
    },

    // 3. The Actuals (Achievements updated via Aggregation)
    achievements: {
      sales_amount: { type: Number, default: 0 },
      gold_weight: { type: Number, default: 0 },
      diamond_weight: { type: Number, default: 0 },
      stone_weight: { type: Number, default: 0 },
    },

    // 4. Status & Metadata
    status: {
      type: String,
      enum: ["pending", "achieved", "exceeded", "missed"],
      default: "pending",
    },
    remarks: { type: String, trim: true },
  },
  {
    timestamps: true, // Automatically creates createdAt and updatedAt
  },
);

// CRITICAL: Ensure only ONE target record per month/year (store-wide)
salesTargetSchema.index({ month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model("salestarget", salesTargetSchema);
