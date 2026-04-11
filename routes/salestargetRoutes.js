const express = require("express");
const router = express.Router();
const SalesTarget = require("../models/salestargetSchema");
const Sold = require("../models/soldSchema");
const Footfall = require("../models/footfallSchema");
const mongoose = require("mongoose");

// @route   POST /api/targets
// @desc    Create or Update store-wide target for a specific month/year
router.post("/", async (req, res) => {
  const { month, year, targets } = req.body;
  try {
    const target = await SalesTarget.findOneAndUpdate(
      { month, year },
      { $set: { targets } },
      { new: true, upsert: true },
    );
    res.json(target);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route   GET /api/targets/:month/:year
// @desc    Get store-wide target and achievement for a specific month/year
router.get("/:month/:year", async (req, res) => {
  try {
    const target = await SalesTarget.findOne({
      month: req.params.month,
      year: req.params.year,
    });

    if (!target) return res.status(404).json({ msg: "Target not found" });
    res.json(target);
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// @route   PUT /api/targets/calculate/:month/:year
// @desc    Calculate and Update store-wide Achievements from Sold, Footfall, and Orders
router.put("/calculate/:month/:year", async (req, res) => {
  const month = parseInt(req.params.month);
  const year = parseInt(req.params.year);

  // 1. Define Date Range (Ensuring full day coverage)
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);

  try {
    // 2. Aggregate Data from 'Sold' collection
    const salesData = await Sold.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$products" },
      {
        $group: {
          _id: null,
          // CRITICAL: Convert Strings ("41.980") to Double for Math
          totalSales: {
            $sum: {
              $convert: {
                input: "$products.amount",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          totalGold: {
            $sum: {
              $convert: {
                input: "$products.gold_wt",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          totalDiamond: {
            $sum: {
              $convert: {
                input: "$products.dia_wt",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
          totalStone: {
            $sum: {
              $convert: {
                input: "$products.stn_wt",
                to: "double",
                onError: 0,
                onNull: 0,
              },
            },
          },
        },
      },
    ]);

    console.log("Found Sales Data:", salesData); // Debugging: Check your terminal!

    // Default to 0 if no data is found for that month
    const stats =
      salesData.length > 0
        ? salesData[0]
        : {
            totalSales: 0,
            totalGold: 0,
            totalDiamond: 0,
            totalStone: 0,
          };

    // 3. Update the specific SalesTarget document
    const updatedTarget = await SalesTarget.findOneAndUpdate(
      { month: month, year: year },
      {
        $set: {
          "achievements.gold_weight": stats.totalGold,
          "achievements.diamond_weight": stats.totalDiamond,
          "achievements.stone_weight": stats.totalStone,
          status: "calculated", // Optional: update status
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }, // Creates record if month/year doesn't exist
    );

    res.json(updatedTarget);
  } catch (err) {
    console.error("Aggregation Error:", err);
    res
      .status(500)
      .json({ error: "Internal Server Error", message: err.message });
  }
});

module.exports = router;
