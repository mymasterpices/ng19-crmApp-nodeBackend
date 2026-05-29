const mongoose = require("mongoose");

// Sub-schema for individual daily entries
const DailyFootfallSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
    },
    footfall: {
      type: Number,
      default: 0,
      min: 0,
    },
    conversion: {
      type: Number,
      default: 0,
      min: 0,
    },
    pc: [
      {
        type: String,
      },
    ],
  },
  { _id: false },
);

const MonthlyReportSchema = new mongoose.Schema(
  {
    year: { type: Number, required: true, index: true },
    month: { type: Number, required: true, min: 1, max: 12, index: true },
    user_status: { type: String },
    user_id: { type: String, required: true, index: true },
    sales_person: { type: String, required: true },
    daily_stats: [DailyFootfallSchema],
    monthly_summary: {
      total_footfall: { type: Number, default: 0 },
      total_conversion: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

// Ensures one unique document per user per month
MonthlyReportSchema.index({ year: 1, month: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyReport", MonthlyReportSchema);
