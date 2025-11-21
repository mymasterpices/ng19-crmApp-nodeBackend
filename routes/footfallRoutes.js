const express = require("express");
const router = express.Router();
const Footfall = require("../models/footfallSchema"); // Your Footfall model

// POST: create new user or append foot entries
router.post("/save/:userId", async (req, res) => {
  const { userId } = req.params;
  const { name, username, foot_entry } = req.body;

  try {
    if (!foot_entry || !Array.isArray(foot_entry) || foot_entry.length === 0) {
      return res.status(400).json({ error: "foot_entry array is required" });
    }

    // Check if user exists
    let user = await Footfall.findOne({ user_id: userId });

    if (!user) {
      // Create new user with provided foot entries
      user = new Footfall({
        username: username || "unknown",
        user_id: userId,
        foot_entry: foot_entry.map((entry) => ({
          footfall: entry.footfall,
          conversion: entry.conversion,
          timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
        })),
      });
    } else {
      // User exists, append new foot entries
      foot_entry.forEach((entry) => {
        const entryDate = entry.timestamp
          ? new Date(entry.timestamp)
          : new Date();
        if (entryDate <= new Date()) {
          // prevent future timestamps
          user.foot_entry.push({
            footfall: entry.footfall,
            conversion: entry.conversion,
            timestamp: entryDate,
          });
        }
      });
    }

    await user.save();

    return res.status(201).json({
      message: "Foot entries saved successfully",
      user,
    });
  } catch (err) {
    console.error("Error saving foot entries:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// GET all users with foot entries
router.get("/get", async (req, res) => {
  try {
    const query = req.query || {};
    const users = await Footfall.find(query);
    return res.status(200).json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

//Update the footfall data for a user
router.patch("/update/:userId/:entryId", async (req, res) => {
  const { userId, entryId } = req.params;
  const { footfall, conversion } = req.body;

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
      { new: true }
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
});

//Delete a specific foot entry for a user
router.delete("/delete/:userId/:entryId", async (req, res) => {
  const { userId, entryId } = req.params;
  try {
    const updatedUser = await Footfall.findOneAndUpdate(
      { user_id: userId },
      { $pull: { foot_entry: { _id: entryId } } },
      { new: true }
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
});

module.exports = router;
