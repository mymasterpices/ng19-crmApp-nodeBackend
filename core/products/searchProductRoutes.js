const express = require("express");
const router = express.Router();
const Product = require("./searchProductSchema");
const { verifyToken } = require("../../middleware/jwt");

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

// ---------------------- CSV UPLOAD ----------------------
router.post("/upload-csv", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const delimiter = detectDelimiter(req.file.path);
  const productsMap = {};
  let lastJewelCode = null;
  let rowCount = 0;

  const parseNumber = (val) => {
    if (val === null || val === undefined || val === "") return undefined;
    const cleaned = String(val).replace(/,/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? undefined : num;
  };

  fs.createReadStream(req.file.path, { encoding: "utf8" })
    .pipe(
      csv({
        separator: delimiter,
        skipEmptyLines: true,
        trim: true,
        mapHeaders: ({ header }) =>
          header.trim().toLowerCase().replace(/\s+/g, "_"),
      }),
    )
    .on("data", (data) => {
      rowCount++;

      let jewelCode = data.jewel_code ? data.jewel_code.trim() : lastJewelCode;
      if (!jewelCode) return;
      lastJewelCode = jewelCode;

      // Initialize Product if it doesn't exist
      if (!productsMap[jewelCode]) {
        productsMap[jewelCode] = {
          product_category: data.product_category,
          sub_category: data.sub_category,
          quality_code: data.quality_code,
          jewel_code: jewelCode,
          material: data.material,
          mrp: parseNumber(data.mrp),
          metal_amt: parseNumber(data.metal_amt),
          making_charge: parseNumber(data.making_charge),
          gross_wt: parseNumber(data.gross_wt),
          net_wt: parseNumber(data.net_wt),
          discount_amount: parseNumber(data.discount_amount),
          final_price: parseNumber(data.final_price),
          collection: data.collection,
          product_image_url: data.product_image_url,
          gender: data.gender,
          making_amt: parseNumber(data.making_amt),
          diamonds: [],
          stones: [],
        };
      }

      // Map Diamond Data (Matches diamondSchema)
      if (data.dia_wt || data.dia_amt) {
        productsMap[jewelCode].diamonds.push({
          diamond_colour: data.diamond_colour,
          diamond_clarity: data.diamond_clarity,
          dia_wt: parseNumber(data.dia_wt),
          dia_amt: parseNumber(data.dia_amt),
          dia_size: data.dia_size,
          diamond_shape: data.diamond_shape,
          dia_rate: parseNumber(data.dia_rate),
          diamond_pcs: parseNumber(data.diamond_pcs),
        });
      }

      // Map Stone Data (Matches color_stoneSchema)
      if (data.stone_wt || data.stone_amt) {
        productsMap[jewelCode].stones.push({
          stone_wt: parseNumber(data.stone_wt),
          stone_amt: parseNumber(data.stone_amt),
          stone_type: data.stone_type,
          stone_pcs: parseNumber(data.stone_pcs),
          stone_rate: parseNumber(data.stone_rate),
        });
      }
    })
    .on("end", async () => {
      try {
        const products = Object.values(productsMap);
        await Product.deleteMany({}); // Clears existing collection
        const inserted = await Product.insertMany(products);

        fs.unlink(req.file.path, () => {}); // Cleanup file
        res.json({ message: "Import successful", count: inserted.length });
      } catch (error) {
        res
          .status(500)
          .json({ message: "Database Error", error: error.message });
      }
    })
    .on("error", (err) => {
      res.status(500).json({ message: "Parse Error", error: err.message });
    });
});

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

module.exports = router;
