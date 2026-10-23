const express = require("express");
const router = express.Router();
const Product = require("./searchProductSchema");

const viewerReadOnly = require("../../middleware/viewerReadOnly");

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

// ---------------------- HELPERS: QUERY ----------------------
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const exactCI = (v) => new RegExp(`^${escapeRegex(v.trim())}$`, "i");

// ---------------------- CSV UPLOAD (unchanged) ----------------------
router.post(
  "/upload-csv",
  viewerReadOnly,
  upload.single("file"),
  (req, res) => {
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

        let jewelCode = data.jewel_code
          ? data.jewel_code.trim()
          : lastJewelCode;
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
  },
);

// ---------------------- SEARCH (case-insensitive tag) ----------------------
router.post("/search", async (req, res) => {
  try {
    const { jewel_code } = req.body;

    if (!jewel_code) {
      return res.status(400).json({ message: "jewel_code is required" });
    }

    const products = await Product.find({ jewel_code: exactCI(jewel_code) });
    res.status(200).json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong!" });
  }
});

// ---------------------- FILTER OPTIONS (for the UI) ----------------------
// GET /products/filters
router.get("/filters", async (req, res) => {
  try {
    const clean = (arr) =>
      [
        ...new Set(arr.map((v) => String(v || "").trim()).filter(Boolean)),
      ].sort();

    const [
      categories,
      sub_categories,
      materials,
      genders,
      collections,
      stone_types,
      hasDiamond,
    ] = await Promise.all([
      Product.distinct("product_category"),
      Product.distinct("sub_category"),
      Product.distinct("material"),
      Product.distinct("gender"),
      Product.distinct("collection"),
      Product.distinct("stones.stone_type"),
      Product.exists({ "diamonds.0": { $exists: true } }),
    ]);

    // material looks like GW18 / PL950 -> metal "GW" + purity "18"
    const metals = new Set();
    const purities = new Set();
    materials.forEach((m) => {
      const x = /^([A-Za-z]+)(\d+)$/.exec(String(m || "").trim());
      if (x) {
        metals.add(x[1].toUpperCase());
        purities.add(x[2]);
      }
    });

    res.json({
      categories: clean(categories),
      sub_categories: clean(sub_categories),
      metals: [...metals].sort(),
      purities: [...purities].sort((a, b) => a - b),
      genders: clean(genders),
      collections: clean(collections),
      stone_types: clean([...(hasDiamond ? ["Diamond"] : []), ...stone_types]),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong!" });
  }
});

// ---------------------- GET ALL PRODUCTS (paginated + filters) ----------------------
// GET /products?page=1&limit=12&sort=new&category=Rings&gender=Women&metal=GW&purity=18
router.get("/", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 100);
    const {
      category,
      sub_category,
      gender,
      collection,
      metal,
      purity,
      stone_type,
      maxPrice,
      sort,
    } = req.query;

    const filter = {};
    if (category) filter.product_category = exactCI(category);
    if (sub_category) filter.sub_category = exactCI(sub_category);
    if (gender) filter.gender = exactCI(gender);
    if (collection) filter.collection = exactCI(collection);

    if (metal || purity) {
      const m = metal ? escapeRegex(metal) : "[A-Za-z]+";
      const p = purity ? escapeRegex(purity) : "\\d+";
      filter.material = new RegExp(`^${m}${p}$`, "i");
    }

    if (stone_type) {
      if (stone_type.toLowerCase() === "diamond") {
        filter["diamonds.0"] = { $exists: true };
      } else {
        filter["stones.stone_type"] = exactCI(stone_type);
      }
    }

    const max = parseFloat(maxPrice);
    if (!isNaN(max)) filter.final_price = { $lte: max };

    // _id is the tiebreaker so pages never repeat or skip items
    const sortMap = {
      new: { createdAt: -1, _id: -1 },
      price_asc: { final_price: 1, _id: 1 },
      price_desc: { final_price: -1, _id: -1 },
    };

    const [data, total] = await Promise.all([
      Product.find(filter)
        .sort(sortMap[sort] || sortMap.new)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    res
      .status(200)
      .json({ data, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Something went wrong!" });
  }
});

module.exports = router;
