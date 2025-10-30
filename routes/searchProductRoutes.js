const express = require("express");
const router = express.Router();
const Product = require("../models/searchProductSchema");
const { verifyToken } = require("../middleware/jwt");

const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");

// Ensure uploads folder exists
const uploadFolder = path.join(__dirname, "../uploads/csv");
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

// Setup multer with file validation
const upload = multer({
  dest: uploadFolder,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed!"), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// ---------------------- HELPER: DETECT DELIMITER ----------------------
function detectDelimiter(filePath) {
  const sample = fs.readFileSync(filePath, { encoding: "utf8" }).slice(0, 1024);
  const delimiters = [",", ";", "\t", "|"];
  let maxCount = 0;
  let detectedDelimiter = ",";

  delimiters.forEach((delimiter) => {
    const count = (sample.match(new RegExp(`\\${delimiter}`, "g")) || [])
      .length;
    if (count > maxCount) {
      maxCount = count;
      detectedDelimiter = delimiter;
    }
  });

  console.log(`🔍 Detected delimiter: "${detectedDelimiter}"`);
  return detectedDelimiter;
}

// ---------------------- SEARCH ----------------------
router.post("/search", verifyToken, async (req, res) => {
  try {
    const { jewel_code } = req.body;

    if (!jewel_code) {
      return res.status(400).json({ message: "jewel_code is required" });
    }

    const products = await Product.find({ jewel_code });
    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong!" });
  }
});

// ---------------------- CSV UPLOAD ----------------------
router.post("/upload-csv", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  console.log(`📁 File received: ${req.file.originalname}`);

  // Detect delimiter
  const delimiter = detectDelimiter(req.file.path);

  const productsMap = {};
  let lastJewelCode = null; // Track last product for multi-row diamonds
  let rowCount = 0;
  let skippedRows = 0;

  fs.createReadStream(req.file.path, { encoding: "utf8" })
    .pipe(
      csv({
        separator: delimiter,
        skipEmptyLines: true,
        trim: true,
        mapHeaders: ({ header }) =>
          header.trim().toLowerCase().replace(/\s+/g, "_"),
      })
    )
    .on("headers", (headers) => {
      console.log(`📋 CSV Headers:`, headers);
    })
    .on("data", (data) => {
      rowCount++;

      const parseNumber = (val) => {
        if (val === null || val === undefined || val === "") return undefined;
        const cleaned = String(val).replace(/,/g, "");
        const num = parseFloat(cleaned);
        return isNaN(num) ? undefined : num;
      };

      // Use jewel_code if present, otherwise assign to lastJewelCode
      let jewelCode = data.jewel_code ? data.jewel_code.trim() : lastJewelCode;
      if (!jewelCode) {
        skippedRows++;
        if (skippedRows <= 3)
          console.log(`⚠️ Skipped row ${rowCount} - missing jewel_code`, data);
        return;
      }

      lastJewelCode = jewelCode; // update lastJewelCode for next rows

      // Create product entry if it doesn't exist
      if (!productsMap[jewelCode]) {
        productsMap[jewelCode] = {
          product_category: data.product_category,
          sub_category: data.sub_category,
          jewel_code: jewelCode,
          material: data.material || data.gold_purity,
          mrp: parseNumber(data.mrp),
          gross_wt: parseNumber(data.gross_wt),
          net_wt: parseNumber(data.net_wt),
          diamonds: [],
          stones: [],
          discount_amount: parseNumber(data.discount),
          final_price: parseNumber(data.final_price),
          making_charge: parseNumber(data.making_charge),
          making_amt: parseNumber(data.making_amt),
          metal_amt: parseNumber(data.metal_amt),
          collection: data.collection,
          product_image_url: data.product_image_url,
          gender: data.gender,
        };
      }

      // Add diamond info if present
      if (data.dia_wt || data.dia_amt) {
        productsMap[jewelCode].diamonds.push({
          diamond_colour: data.diamond_colour,
          quality_code: data.quality_code,
          weight: parseNumber(data.dia_wt),
          amount: parseNumber(data.dia_amt),
        });
      }

      // Add coloured stone info if present
      if (data.colour_stone_wt || data.colour_stone_amt) {
        productsMap[jewelCode].stones.push({
          colour_stone_wt: parseNumber(data.colour_stone_wt),
          colour_stone_amt: parseNumber(data.colour_stone_amt),
        });
      }
    })
    .on("end", async () => {
      try {
        const products = Object.values(productsMap);
        console.log(
          `📊 Processed ${rowCount} rows, valid products: ${products.length}`
        );

        if (products.length === 0) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ message: "No valid products found" });
        }

        // Replace the collection (optional)
        await Product.deleteMany({});
        const inserted = await Product.insertMany(products);

        fs.unlink(req.file.path, (err) => {
          if (err) console.warn("⚠️ Failed to delete uploaded file:", err);
        });

        console.log(`✅ Successfully imported ${inserted.length} products`);

        res.json({
          message: "Product collection replaced successfully",
          insertedCount: inserted.length,
          totalRows: rowCount,
          skippedRows: skippedRows,
        });
      } catch (error) {
        console.error("❌ Error saving Product data:", error);

        fs.unlink(req.file.path, () => {});

        res.status(500).json({
          message: "Error saving Product data",
          error: error.message,
        });
      }
    })
    .on("error", (err) => {
      console.error("❌ CSV parse error:", err);

      if (req.file?.path) fs.unlink(req.file.path, () => {});

      res.status(500).json({
        message: "CSV parse error",
        error: err.message,
      });
    });
});

module.exports = router;
