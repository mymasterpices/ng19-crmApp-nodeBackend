const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const axios = require("axios");
const router = express.Router();

const SHEET_ID = process.env.SHEET_ID;
const API_KEY = process.env.API_KEY;

// ── Helper: parse % safely ─────────────────────────────────
const safePc = (val) => {
  if (!val || val === "" || val === "#DIV/0!" || val === "#VALUE!") return null;
  const n = parseFloat(val.toString().replace("%", "").trim());
  return isNaN(n) ? null : n;
};

const safeNum = (val) => {
  if (!val || val === "" || val === "#DIV/0!" || val === "#VALUE!") return 0;
  const n = parseFloat(val.toString().replace("%", "").trim());
  return isNaN(n) ? 0 : n;
};

// ── GET all tab names ──────────────────────────────────────
router.get("/tabs", async (req, res) => {
  try {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}&fields=sheets.properties.title`;
    const response = await axios.get(url);
    const tabs = response.data.sheets.map((s) => s.properties.title);
    res.json({ success: true, tabs });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// ── Parse a single sheet tab ───────────────────────────────
const parseSheet = async (sheetName) => {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}?key=${API_KEY}`;
  const response = await axios.get(url);
  const rows = response.data.values;

  if (!rows || rows.length < 3)
    return { salespersons: [], data: [], months: [] };

  const nameRow = rows[0];

  // Salesperson blocks start at col 5, each block = 4 cols
  const salespersons = [];
  let col = 5;
  while (col < nameRow.length) {
    const name = nameRow[col]?.trim();
    if (name && name !== "") {
      salespersons.push({
        name,
        footfallCol: col,
        conversionCol: col + 1,
        pcCol: col + 2,
        convPcCol: col + 3,
      });
    }
    col += 4;
  }

  const TOTAL_COLS = { footfall: 1, conversion: 2, percentage: 3 };
  const NEW_CUSTOMERS_COL = 4;

  const dailyData = [];
  const monthsMap = new Map();

  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0) continue;

    const dateLabel = row[0]?.trim();
    if (!dateLabel) continue;

    const isTotal = dateLabel.toLowerCase().includes("total");

    const entry = {
      date: dateLabel,
      isTotal,
      newCustomers: safeNum(row[NEW_CUSTOMERS_COL]),
      total: {
        footfall: safeNum(row[TOTAL_COLS.footfall]),
        conversion: safeNum(row[TOTAL_COLS.conversion]),
        percentage: safePc(row[TOTAL_COLS.percentage]),
      },
    };

    // ✅ FIX: trim the salesperson name key to avoid whitespace mismatch
    salespersons.forEach((sp) => {
      entry[sp.name] = {
        footfall: safeNum(row[sp.footfallCol]),
        conversion: safeNum(row[sp.conversionCol]),
        pc: row[sp.pcCol]?.trim() || "",
        conversionPc: safePc(row[sp.convPcCol]),
      };
    });

    // Track months from non-total rows
    if (!isTotal) {
      const parts = dateLabel.replace(/\//g, "-").split("-");
      if (parts.length === 3) {
        // Support both DD-MM-YYYY and YYYY-MM-DD
        let year, month;
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          year = parts[0];
          month = parts[1];
        } else {
          // DD-MM-YYYY
          year = parts[2];
          month = parts[1];
        }
        const monthKey = `${year}-${month}`;
        if (!monthsMap.has(monthKey)) {
          const y = parseInt(year);
          const m = parseInt(month) - 1;
          monthsMap.set(monthKey, {
            key: monthKey,
            label: new Date(y, m, 1).toLocaleString("default", {
              month: "long",
              year: "numeric",
            }),
          });
        }
      }
    }

    dailyData.push(entry);
  }

  return {
    salespersons: salespersons.map((s) => s.name),
    data: dailyData,
    months: Array.from(monthsMap.values()),
  };
};

// ── GET data for a specific tab ────────────────────────────
router.get("/", async (req, res) => {
  try {
    const sheetName = req.query.tab || "rkjfootfalldata";
    const result = await parseSheet(sheetName);
    res.json({ success: true, tab: sheetName, ...result });
  } catch (error) {
    console.error("Sheet fetch error:", error.message);
    res.status(500).json({
      message: "Failed to fetch sheet data",
      error: error.message,
      details: error.response?.data,
    });
  }
});

// ── GET all tabs data at once ──────────────────────────────
router.get("/all", async (req, res) => {
  try {
    const tabsRes = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?key=${API_KEY}&fields=sheets.properties.title`,
    );
    const tabs = tabsRes.data.sheets.map((s) => s.properties.title);

    const results = {};
    for (const tab of tabs) {
      results[tab] = await parseSheet(tab);
    }

    res.json({ success: true, tabs, data: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
