const express = require("express");
const router = express.Router();
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const Footfall = require("../models/footfallSchema"); // Your Footfall model

// temp upload folder
const upload = multer({ dest: "uploads/csv" });

// POST: create new user or append foot entries
router.post("/save/:userId", async (req, res) => {
  const { userId } = req.params;
  const { username, foot_entry, pc } = req.body;

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
          pc: pc || null,
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
router.patch("/update/:userId", async (req, res) => {
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

// Helper: parse Excel-ish dates like "1/2/2025", "13-02-2025" into UTC Date
function parseExcelDateToUTC(raw) {
  if (!raw) return null;
  const str = String(raw).trim();
  if (!str) return null;

  // dd/mm/yyyy  (e.g. 1/2/2025)
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m.map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (!isNaN(d.getTime())) return d;
  }

  // dd-mm-yyyy  (e.g. 13-02-2025)
  m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m.map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (!isNaN(d.getTime())) return d;
  }

  // Fallback: let JS try (ISO, etc.)
  const d = new Date(str);
  if (!isNaN(d.getTime())) return d;

  return null; // unrecognized / bad
}
//bulk import foot entries for a user
// bulk import foot entries for a user
router.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res
      .status(400)
      .json({ error: "CSV file is required (field name: file)" });
  }

  const filePath = req.file.path;

  // { user_id: { username, entries: [] } }
  const userGroups = {};
  let lastUserId = null;
  let lastUsername = null;

  try {
    // 1) Read & group CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => {
          try {
            // read raw values
            let user_id = (row.user_id || "").toString().trim();
            let username = (row.username || "").toString().trim();

            // if user_id empty, reuse last non-empty one (Excel-style)
            if (!user_id && lastUserId) {
              user_id = lastUserId;
              if (!username) username = lastUsername;
            }

            // still no user_id? skip this row
            if (!user_id) return;

            lastUserId = user_id;
            lastUsername = username;

            const rawFootfall = row.footfall;
            const rawConversion = row.conversion;

            // If BOTH footfall & conversion are empty -> treat as "no data" row, skip
            const hasFootfall =
              rawFootfall !== undefined &&
              rawFootfall !== null &&
              String(rawFootfall).trim() !== "";
            const hasConversion =
              rawConversion !== undefined &&
              rawConversion !== null &&
              String(rawConversion).trim() !== "";

            if (!hasFootfall && !hasConversion) {
              // no numeric data at all → skip this row
              return;
            }

            const footfall = hasFootfall ? Number(rawFootfall) || 0 : 0;
            const conversion = hasConversion ? Number(rawConversion) || 0 : 0;

            // pc as nullable string
            let pc = row.pc;
            if (pc === undefined || pc === null || String(pc).trim() === "") {
              pc = null;
            } else {
              pc = String(pc).trim();
            }

            const ts = parseExcelDateToUTC(row.timestamp);
            if (!ts) return; // bad / missing date → skip

            if (!userGroups[user_id]) {
              userGroups[user_id] = {
                username,
                entries: [],
              };
            }

            userGroups[user_id].entries.push({
              footfall,
              conversion,
              pc,
              timestamp: ts,
            });
          } catch (e) {
            console.error("Row parse error:", e, row);
          }
        })
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });

    // 2) Write grouped data into Mongo
    const now = new Date();
    const results = [];
    let totalImported = 0;

    for (const [user_id, group] of Object.entries(userGroups)) {
      let userDoc = await Footfall.findOne({ user_id });

      // create document if it doesn't exist
      if (!userDoc) {
        userDoc = new Footfall({
          username: group.username || `user-${user_id}`,
          user_id,
          foot_entry: [],
        });
      }

      let importedForUser = 0;

      group.entries.forEach((entry) => {
        // prevent future timestamps
        if (entry.timestamp > now) return;

        userDoc.foot_entry.push({
          footfall: entry.footfall,
          conversion: entry.conversion,
          pc: entry.pc,
          timestamp: entry.timestamp,
        });

        importedForUser++;
      });

      await userDoc.save();

      totalImported += importedForUser;

      results.push({
        user_id,
        username: userDoc.username,
        imported: importedForUser,
        totalFootEntries: userDoc.foot_entry.length,
      });
    }

    // 3) Cleanup temp file
    fs.unlink(filePath, () => {});

    return res.status(200).json({
      message: "CSV imported successfully",
      totalImported,
      usersProcessed: results.length,
      results,
    });
  } catch (err) {
    console.error("CSV import error:", err);
    fs.unlink(filePath, () => {});
    return res.status(500).json({ error: "Server error during import" });
  }
});

module.exports = router;
