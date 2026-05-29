const express = require("express");
const router = express.Router();
const MonthlyReport = require("./footfalldataSchema");
const Customer = require("../auth/authSchema");

const multer = require("multer");
const { parse } = require("csv-parse");
const fs = require("fs");
const path = require("path");
const User = require("../../core/auth/authSchema");

// ─── multer setup (was missing — caused "upload is not defined" crash) ────────
const upload = multer({ dest: path.join(__dirname, "../../uploads/tmp/") });

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a date string in DD-MM-YYYY or DD/MM/YYYY format → UTC midnight Date.
 * Returns null when the string cannot be parsed.
 */
function parseDMY(str) {
  const parts = str.split(/[-\/]/);
  if (parts.length !== 3) return null;

  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;

  const d = new Date(Date.UTC(yyyy, mm - 1, dd));

  // Guard against invalid calendar dates (e.g. 31/02)
  if (
    d.getUTCFullYear() !== yyyy ||
    d.getUTCMonth() !== mm - 1 ||
    d.getUTCDate() !== dd
  ) {
    return null;
  }

  return d;
}

/**
 * Safely convert a cell value to a non-negative integer.
 * Returns 0 for blank, "#VALUE!", "#DIV/0!", non-numeric, or negative values.
 */
function safeInt(raw) {
  if (!raw || String(raw).includes("#")) return 0;
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Resolve start/end dates from query params.
 * rangeType=weekly|monthly  OR  rangeType=custom&startDate=&endDate=
 */
function resolveDateRange(query) {
  const now = new Date();

  if (query.rangeType === "custom" && query.startDate && query.endDate) {
    return {
      start: new Date(query.startDate),
      end: new Date(query.endDate),
    };
  }

  if (query.rangeType === "weekly") {
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return { start: monday, end: sunday };
  }

  // default → current calendar month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
  return { start, end };
}

/**
 * Given a date range, return the equally-sized range immediately before it.
 */
function previousRange(start, end) {
  const len = end.getTime() - start.getTime();
  return {
    prevStart: new Date(start.getTime() - len),
    prevEnd: new Date(start.getTime() - 1),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /import  —  Bulk footfall import from CSV
//
// CSV FORMAT
// ──────────
// Row 0  : user_id | username | timestamp | footfall | conversion | pc
// Row N  : user_id and username are set ONLY on the first row of each user
//          block; subsequent rows leave those columns blank.
//          timestamp : DD-MM-YYYY  or  DD/MM/YYYY
//          pc        : comma-separated codes, e.g. "DR,DP"  (may be blank)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "CSV file is required (field name: file)" });
  }

  const filePath = req.file.path;

  try {
    // ── 1. Read every raw row ──────────────────────────────────────────────
    const allRows = await new Promise((resolve, reject) => {
      const rows = [];
      fs.createReadStream(filePath)
        .pipe(parse({ delimiter: ",", relax_column_count: true, trim: true }))
        .on("data", (r) => rows.push(r))
        .on("end", () => resolve(rows))
        .on("error", reject);
    });

    if (allRows.length < 2) {
      throw new Error("CSV file is empty or missing data rows.");
    }

    // ── 2. Validate header ─────────────────────────────────────────────────
    const [headerRow, ...dataRows] = allRows;
    const expectedHeader = [
      "user_id",
      "username",
      "timestamp",
      "footfall",
      "conversion",
      "pc",
    ];
    const headerOk = expectedHeader.every(
      (col, i) => (headerRow[i] || "").toLowerCase() === col,
    );
    if (!headerOk) {
      throw new Error(
        `Unexpected CSV header. Expected: ${expectedHeader.join(", ")}. ` +
          `Got: ${headerRow.slice(0, 6).join(", ")}`,
      );
    }

    // ── 3. Parse rows → group by user → year → month ──────────────────────
    const groupedData = {}; // { user_id: { year: { month: [dailyEntry] } } }
    const userMeta = {}; // { user_id: username }
    const now = new Date();

    let currentUserId = null;
    let currentUsername = null;

    for (const row of dataRows) {
      // Pick up a new user block whenever user_id column is non-empty
      if (row[0] && row[0] !== "") {
        currentUserId = row[0].trim();
        currentUsername = (row[1] || "").trim();
        userMeta[currentUserId] = currentUsername;
      }

      if (!currentUserId) continue; // No user context yet → skip

      const rawTimestamp = (row[2] || "").trim();

      // Skip blank, TOTAL, or broken date cells
      if (
        !rawTimestamp ||
        rawTimestamp.toUpperCase() === "TOTAL" ||
        rawTimestamp.includes("#")
      ) {
        continue;
      }

      const entryDate = parseDMY(rawTimestamp);
      if (!entryDate || isNaN(entryDate.getTime())) continue;

      // Block future dates
      if (entryDate > now) continue;

      const year = entryDate.getUTCFullYear();
      const month = entryDate.getUTCMonth() + 1; // 1-12

      const footfall = safeInt(row[3]);
      const conversion = safeInt(row[4]);

      const pcRaw = (row[5] || "").trim();
      const pc = pcRaw
        ? pcRaw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      // Skip completely empty rows (no footfall, no conversion, no pc)
      if (footfall === 0 && conversion === 0 && pc.length === 0) continue;

      if (!groupedData[currentUserId]) groupedData[currentUserId] = {};
      if (!groupedData[currentUserId][year])
        groupedData[currentUserId][year] = {};
      if (!groupedData[currentUserId][year][month])
        groupedData[currentUserId][year][month] = [];

      groupedData[currentUserId][year][month].push({
        date: entryDate,
        footfall,
        conversion,
        pc,
      });
    }

    // ── 4. Upsert into MongoDB ─────────────────────────────────────────────
    let totalDailyEntries = 0;
    let monthlyDocumentsAffected = 0;

    for (const [user_id, yearsObj] of Object.entries(groupedData)) {
      const sales_person = userMeta[user_id] || user_id;

      for (const [yearStr, monthsObj] of Object.entries(yearsObj)) {
        const year = Number(yearStr);

        for (const [monthStr, dailyEntries] of Object.entries(monthsObj)) {
          const month = Number(monthStr);

          let reportDoc = await MonthlyReport.findOne({ year, month, user_id });

          if (!reportDoc) {
            reportDoc = new MonthlyReport({
              year,
              month,
              user_id,
              sales_person,
              user_status: "active",
              daily_stats: [],
              monthly_summary: { total_footfall: 0, total_conversion: 0 },
            });
          }

          for (const newDay of dailyEntries) {
            const idx = reportDoc.daily_stats.findIndex(
              (d) => new Date(d.date).getTime() === newDay.date.getTime(),
            );

            if (idx !== -1) {
              reportDoc.daily_stats[idx].footfall = newDay.footfall;
              reportDoc.daily_stats[idx].conversion = newDay.conversion;
              reportDoc.daily_stats[idx].pc = newDay.pc;
            } else {
              reportDoc.daily_stats.push(newDay);
            }

            totalDailyEntries++;
          }

          // Sort chronologically
          reportDoc.daily_stats.sort(
            (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
          );

          // Recalculate monthly summary
          const totals = reportDoc.daily_stats.reduce(
            (acc, d) => {
              acc.footfall += d.footfall || 0;
              acc.conversion += d.conversion || 0;
              return acc;
            },
            { footfall: 0, conversion: 0 },
          );

          reportDoc.monthly_summary.total_footfall = totals.footfall;
          reportDoc.monthly_summary.total_conversion = totals.conversion;

          await reportDoc.save();
          monthlyDocumentsAffected++;
        }
      }
    }

    // ── 5. Clean up temp file ──────────────────────────────────────────────
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    return res.status(200).json({
      message: "CSV successfully imported.",
      usersProcessed: Object.keys(groupedData).length,
      totalDailyEntriesProcessed: totalDailyEntries,
      monthlyDocumentsCreatedOrUpdated: monthlyDocumentsAffected,
    });
  } catch (err) {
    console.error("Footfall CSV import error:", err);
    if (req.file && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return res.status(500).json({ error: `Import failed: ${err.message}` });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /  —  Add or update a single daily footfall entry
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  const { year, month, user_id, daily_stat } = req.body;

  const hasNoActivity =
    !daily_stat ||
    daily_stat.footfall === null ||
    daily_stat.footfall === undefined ||
    daily_stat.footfall === 0;

  try {
    let report = await MonthlyReport.findOne({ year, month, user_id });

    if (report) {
      const idx = report.daily_stats.findIndex(
        (s) =>
          new Date(s.date).toISOString() ===
          new Date(daily_stat.date).toISOString(),
      );

      if (idx > -1) {
        if (hasNoActivity) {
          report.monthly_summary.total_footfall -=
            report.daily_stats[idx].footfall || 0;
          report.monthly_summary.total_conversion -=
            report.daily_stats[idx].conversion || 0;
          report.daily_stats.splice(idx, 1);
        } else {
          const old = report.daily_stats[idx];
          report.monthly_summary.total_footfall +=
            daily_stat.footfall - (old.footfall || 0);
          report.monthly_summary.total_conversion +=
            daily_stat.conversion - (old.conversion || 0);
          report.daily_stats[idx] = daily_stat;
        }
        await report.save();
      } else if (hasNoActivity) {
        return res
          .status(200)
          .json({ message: "No activity — skipped.", report });
      } else {
        report.daily_stats.push(daily_stat);
        report.monthly_summary.total_footfall += daily_stat.footfall;
        report.monthly_summary.total_conversion += daily_stat.conversion;
        await report.save();
      }
    } else {
      if (hasNoActivity) {
        return res
          .status(200)
          .json({ message: "No activity — parent creation skipped." });
      }

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

    return res.status(201).json(report);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /all
// ─────────────────────────────────────────────────────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const reports = await MonthlyReport.find();
    res.json(reports);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /kpis
// ─────────────────────────────────────────────────────────────────────────────
router.get("/kpis", async (req, res) => {
  try {
    const { start, end } = resolveDateRange(req.query);
    const { prevStart, prevEnd } = previousRange(start, end);

    const aggregate = (s, e) =>
      MonthlyReport.aggregate([
        { $unwind: "$daily_stats" },
        {
          $match: {
            "daily_stats.date": { $gte: s, $lte: e },
            "daily_stats.footfall": { $gt: 0 },
          },
        },
        {
          $group: {
            _id: "$sales_person",
            footfall: { $sum: "$daily_stats.footfall" },
            conversion: { $sum: "$daily_stats.conversion" },
          },
        },
        {
          $group: {
            _id: null,
            totalFootfall: { $sum: "$footfall" },
            totalConversion: { $sum: "$conversion" },
            staff: {
              $push: { name: "$_id", sales: "$conversion" },
            },
          },
        },
      ]);

    const [cur = {}, prev = {}] = await Promise.all([
      aggregate(start, end).then((r) => r[0] || {}),
      aggregate(prevStart, prevEnd).then((r) => r[0] || {}),
    ]);

    const curFF = cur.totalFootfall || 0;
    const curCO = cur.totalConversion || 0;
    const prevFF = prev.totalFootfall || 0;
    const prevCO = prev.totalConversion || 0;

    const curRate = curFF > 0 ? +((curCO / curFF) * 100).toFixed(1) : 0;
    const prevRate = prevFF > 0 ? +((prevCO / prevFF) * 100).toFixed(1) : 0;
    const pct = (c, p) => (p > 0 ? +(((c - p) / p) * 100).toFixed(1) : 0);

    const topPerformer =
      (cur.staff || []).sort((a, b) => b.sales - a.sales)[0] || null;

    res.json({
      totalFootfall: curFF,
      totalConversion: curCO,
      conversionRate: curRate,
      footfallChange: pct(curFF, prevFF),
      conversionChange: pct(curCO, prevCO),
      rateChange: +(curRate - prevRate).toFixed(1),
      topPerformer: topPerformer
        ? { name: topPerformer.name, sales: topPerformer.sales }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /feed
// ─────────────────────────────────────────────────────────────────────────────
router.get("/feed", async (req, res) => {
  try {
    const matchStage = { "daily_stats.footfall": { $gt: 0 } };
    if (req.query.salesPerson) {
      matchStage.sales_person = req.query.salesPerson;
    }

    const rows = await MonthlyReport.aggregate([
      { $unwind: "$daily_stats" },
      { $match: matchStage },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$daily_stats.date" },
          },
          date: { $first: "$daily_stats.date" },
          footfall: { $sum: "$daily_stats.footfall" },
          conversion: { $sum: "$daily_stats.conversion" },
          pcs: { $push: "$daily_stats.pc" },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 6 },
      {
        $project: {
          _id: 0,
          date: 1,
          footfall: 1,
          conversion: 1,
          pcs: {
            $reduce: {
              input: "$pcs",
              initialValue: [],
              in: { $concatArrays: ["$$value", "$$this"] },
            },
          },
        },
      },
    ]);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /top-staff
// ─────────────────────────────────────────────────────────────────────────────
router.get("/top-staff", async (req, res) => {
  try {
    const { start, end } = resolveDateRange(req.query);
    const sortField =
      req.query.sortBy === "conv" ? "conversionRate" : "totalConversion";

    const staff = await MonthlyReport.aggregate([
      { $unwind: "$daily_stats" },
      {
        $match: {
          "daily_stats.date": { $gte: start, $lte: end },
          "daily_stats.footfall": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: "$sales_person",
          totalFootfall: { $sum: "$daily_stats.footfall" },
          totalConversion: { $sum: "$daily_stats.conversion" },
        },
      },
      {
        $addFields: {
          name: "$_id",
          conversionRate: {
            $cond: [
              { $gt: ["$totalFootfall", 0] },
              {
                $round: [
                  {
                    $multiply: [
                      { $divide: ["$totalConversion", "$totalFootfall"] },
                      100,
                    ],
                  },
                  1,
                ],
              },
              0,
            ],
          },
        },
      },
      { $sort: { [sortField]: -1 } },
      { $limit: 4 },
      {
        $project: {
          _id: 0,
          name: 1,
          totalFootfall: 1,
          totalConversion: 1,
          conversionRate: 1,
        },
      },
    ]);

    res.json(staff);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /monthly-comparison
// ─────────────────────────────────────────────────────────────────────────────
router.get("/monthly-comparison", async (req, res) => {
  try {
    const now = new Date();
    const cy = now.getFullYear();
    const cm = now.getMonth(); // 0-indexed
    const lm = cm === 0 ? 11 : cm - 1;
    const ly = cm === 0 ? cy - 1 : cy;

    const monthAgg = (year, month) => {
      const s = new Date(year, month, 1);
      const e = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return MonthlyReport.aggregate([
        { $unwind: "$daily_stats" },
        {
          $match: {
            "daily_stats.date": { $gte: s, $lte: e },
            "daily_stats.footfall": { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalFootfall: { $sum: "$daily_stats.footfall" },
            totalConversion: { $sum: "$daily_stats.conversion" },
            pcList: { $push: "$daily_stats.pc" },
          },
        },
      ]).then((r) => {
        const row = r[0] || {
          totalFootfall: 0,
          totalConversion: 0,
          pcList: [],
        };
        const rate =
          row.totalFootfall > 0
            ? +((row.totalConversion / row.totalFootfall) * 100).toFixed(1)
            : 0;
        const pcCount = (row.pcList || [])
          .flat(2)
          .join(",")
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean).length;
        return { ...row, rate, pcCount };
      });
    };

    const [cur, prev] = await Promise.all([monthAgg(cy, cm), monthAgg(ly, lm)]);
    const maxPC = Math.max(cur.pcCount, prev.pcCount, 1);
    const pct = (c, p) => (p > 0 ? +(((c - p) / p) * 100).toFixed(1) : 0);
    const monthName = (m) =>
      new Date(2000, m, 1).toLocaleString("default", { month: "long" });

    let insight = "";
    if (cur.totalFootfall === 0) {
      insight =
        "No footfall data recorded for this month yet. Start logging entries to generate insights.";
    } else if (cur.rate > prev.rate) {
      insight = `Conversion rate improved by ${(cur.rate - prev.rate).toFixed(1)}% vs last month. Team performance is trending upward — maintain current floor strategies.`;
    } else if (cur.rate < prev.rate) {
      insight = `Conversion rate dipped ${(prev.rate - cur.rate).toFixed(1)}% vs last month. Consider reviewing peak-hour staffing levels and engagement techniques.`;
    } else {
      insight = `Conversion rate is stable at ${cur.rate}% this month. Look for opportunities to push high-value PC deals to lift overall revenue.`;
    }

    res.json({
      label: `${monthName(lm)} – ${monthName(cm)}  ${cy}`,
      convEfficiencyValue: Math.min(cur.rate, 100),
      convEfficiencyChange: +(cur.rate - prev.rate).toFixed(1),
      pcLeadsValue: Math.min((cur.pcCount / maxPC) * 100, 100),
      pcLeadsChange: pct(cur.pcCount, prev.pcCount),
      insight,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /heatmap
// ─────────────────────────────────────────────────────────────────────────────
router.get("/heatmap", async (req, res) => {
  try {
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    monday.setHours(0, 0, 0, 0);

    const windowStart = new Date(monday);
    windowStart.setDate(monday.getDate() - 14);
    const windowEnd = new Date(now);
    windowEnd.setHours(23, 59, 59, 999);

    const rows = await MonthlyReport.aggregate([
      { $unwind: "$daily_stats" },
      {
        $match: {
          "daily_stats.date": { $gte: windowStart, $lte: windowEnd },
          "daily_stats.footfall": { $gt: 0 },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$daily_stats.date" },
          },
          value: { $sum: "$daily_stats.footfall" },
        },
      },
    ]);

    const lookup = new Map(rows.map((r) => [r._id, r.value]));

    const cells = [];
    for (let w = -2; w <= 0; w++) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(monday);
        day.setDate(monday.getDate() + w * 7 + d);
        const key = day.toISOString().slice(0, 10);
        const isFuture = day > now;
        cells.push({
          date: key,
          value: isFuture ? 0 : lookup.get(key) || 0,
          isFuture,
          label: day.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
        });
      }
    }

    res.json(cells);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /yearly-chart/:year
// ─────────────────────────────────────────────────────────────────────────────
router.get("/yearly-chart/:year", async (req, res) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year)) return res.status(400).json({ message: "Invalid year." });

    const rows = await MonthlyReport.aggregate([
      { $match: { year: { $in: [year - 1, year] } } },
      {
        $group: {
          _id: { year: "$year", month: "$month" },
          footfall: { $sum: "$monthly_summary.total_footfall" },
          conversion: { $sum: "$monthly_summary.total_conversion" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const bucket = { [year]: {}, [year - 1]: {} };
    rows.forEach((r) => {
      bucket[r._id.year][r._id.month] = {
        footfall: r.footfall,
        conversion: r.conversion,
      };
    });

    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const shape = (y) =>
      months.map((m) => bucket[y][m] || { footfall: 0, conversion: 0 });

    res.json({ cy: shape(year), ly: shape(year - 1) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});




module.exports = router;
