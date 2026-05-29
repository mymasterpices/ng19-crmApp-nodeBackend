const express = require("express");
const router = express.Router();
const MonthlyReport = require("../models/footfalls/MonthlyReportSchema"); // Path to your model file

/**
 * GET: Fetch a report by Year, Month, and UserID
 * URL: /api/reports/:year/:month/:userId
 */
router.get("/:year/:month/:userId", async (req, res) => {
  try {
    const { year, month, userId } = req.params;

    const report = await MonthlyReport.findOne({
      year: parseInt(year),
      month: parseInt(month),
      user_id: userId,
    });

    if (!report) {
      return res
        .status(404)
        .json({ message: "No report found for this period." });
    }

    res.json(report);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/**
 * POST: Add or Update Daily Footfall Data
 * This uses "upsert" logic: it finds the month document or creates it if it doesn't exist,
 * then pushes the daily data into the array.
 */
router.post("/add-daily", async (req, res) => {
  const { year, month, user_id, daily_stat } = req.body;

  try {
    // 1. Find the document
    let report = await MonthlyReport.findOne({ year, month, user_id });

    if (report) {
      // 2. Check if the date already exists in daily_stats
      const existingStatIndex = report.daily_stats.findIndex(
        (s) => s.date.toISOString() === new Date(daily_stat.date).toISOString(),
      );

      if (existingStatIndex > -1) {
        // 3. Update existing entry & adjust summary
        const oldStat = report.daily_stats[existingStatIndex];

        report.monthly_summary.total_footfall +=
          daily_stat.footfall - oldStat.footfall;
        report.monthly_summary.total_conversion +=
          daily_stat.conversion - oldStat.conversion;

        report.daily_stats[existingStatIndex] = daily_stat;
      } else {
        // 4. Add new entry
        report.daily_stats.push(daily_stat);
        report.monthly_summary.total_footfall += daily_stat.footfall;
        report.monthly_summary.total_conversion += daily_stat.conversion;
      }
      await report.save();
    } else {
      // 5. Create new document if doesn't exist
      report = new MonthlyReport({
        ...req.body,
        monthly_summary: {
          total_footfall: daily_stat.footfall,
          total_conversion: daily_stat.conversion,
        },
        daily_stats: [daily_stat],
      });
      await report.save();
    }

    res.status(201).json(report);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
