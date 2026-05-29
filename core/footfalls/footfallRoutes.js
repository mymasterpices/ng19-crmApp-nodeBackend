const express = require("express");
const router = express.Router();
const multer = require("multer");
const { parse } = require("csv-parse");
const fs = require("fs");
const Footfall = require("./footfallSchema"); // Your Footfall model
const authorizeRoles = require("../../middleware/checkRoles");
const { verifyToken } = require("../../middleware/jwt");

// temp upload folder
const upload = multer({ dest: "uploads/csv" });

// POST: create new user or append foot entries
router.post(
  "/save/:userId",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    const { userId } = req.params;
    const { username, user_status, foot_entry } = req.body; // ✅ no top-level pc

    try {
      if (
        !foot_entry ||
        !Array.isArray(foot_entry) ||
        foot_entry.length === 0
      ) {
        return res.status(400).json({ error: "foot_entry array is required" });
      }

      let user = await Footfall.findOne({ user_id: userId });

      if (!user) {
        user = new Footfall({
          username: username || "unknown",
          user_id: userId,
          user_status: user_status ?? null, // ✅
          foot_entry: foot_entry.map((entry) => ({
            footfall: entry.footfall,
            conversion: entry.conversion,
            pc: entry.pc ?? null, // ✅ from entry, not top-level
            timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
          })),
        });
      } else {
        user.user_status = user_status ?? user.user_status; // ✅ sync on update

        foot_entry.forEach((entry) => {
          const entryDate = entry.timestamp
            ? new Date(entry.timestamp)
            : new Date();

          if (entryDate <= new Date()) {
            user.foot_entry.push({
              footfall: entry.footfall,
              conversion: entry.conversion,
              pc: entry.pc ?? null, // ✅ fixed
              timestamp: entryDate,
            });
          }
        });
      }

      await user.save();
      return res
        .status(201)
        .json({ message: "Foot entries saved successfully", user });
    } catch (err) {
      console.error("Error saving foot entries:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

// GET all users with footfall entries
router.get(
  "/get",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { page = 1, limit = 20, username } = req.query;
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 20;

      let mongoQuery = {};

      if (username && username.trim() !== "") {
        mongoQuery.username = { $regex: username.trim(), $options: "i" };
      }
      if (req.query.user_id) {
        mongoQuery.user_id = req.query.user_id;
      }

      // Total count for paginator
      const totalCount = await Footfall.countDocuments(mongoQuery);

      // Fetch with explicit status ordering via aggregation
      const users = await Footfall.aggregate([
        { $match: mongoQuery },
        {
          $addFields: {
            statusOrder: {
              $switch: {
                branches: [
                  { case: { $eq: ["$user_status", "active"] }, then: 0 },
                  { case: { $eq: ["$user_status", "inactive"] }, then: 1 },
                ],
                default: 2, // null / unknown / missing → last
              },
            },
          },
        },
        { $sort: { statusOrder: 1, createdAt: -1 } },
        { $skip: (pageNum - 1) * limitNum },
        { $limit: limitNum },
        { $project: { statusOrder: 0 } }, // remove helper field from response
      ]);

      return res.status(200).json({
        data: users,
        totalRecords: totalCount,
      });
    } catch (err) {
      console.error("Error fetching users:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

//Update the footfall data for a user
router.patch(
  "/update/:userId",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    const { userId } = req.params;
    const { entryId, footfall, conversion } = req.body;

    try {
      const updatedUser = await Footfall.findOneAndUpdate(
        {
          user_id: userId,
          "foot_entry._id": entryId,
        },
        {
          $set: {
            "foot_entry.$.footfall": footfall,
            "foot_entry.$.conversion": conversion,
          },
        },
        { new: true },
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User or entry not found" });
      }

      return res.status(200).json({
        message: "Entry updated successfully",
        user: updatedUser,
      });
    } catch (err) {
      console.error("Error updating entry:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);

//Delete a specific foot entry for a user
router.delete(
  "/delete/:userId/:entryId",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    const { userId, entryId } = req.params;
    try {
      const updatedUser = await Footfall.findOneAndUpdate(
        { user_id: userId },
        { $pull: { foot_entry: { _id: entryId } } },
        { new: true },
      );

      if (!updatedUser) {
        return res.status(404).json({ error: "User or entry not found" });
      }

      return res.status(200).json({
        message: "Entry deleted successfully",
        user: updatedUser,
      });
    } catch (err) {
      console.error("Error deleting entry:", err);
      return res.status(500).json({ error: "Server error" });
    }
  },
);



module.exports = router;
