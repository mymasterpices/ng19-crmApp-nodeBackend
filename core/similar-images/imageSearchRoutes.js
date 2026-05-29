const express = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");

const router = express.Router();

const PYTHON_URL = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8002";
console.log("✅ imageSearch.routes loaded | PYTHON_URL:", PYTHON_URL);

// Memory storage — buffer forwarded to Python, not saved to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max
  fileFilter: (_req, file, cb) => {
    ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(
      file.mimetype,
    )
      ? cb(null, true)
      : cb(new Error("Images only (jpeg/png/webp)"));
  },
});

// Forward image buffer to Python service
async function callPython(endpoint, buffer, filename, mimetype, fields = {}) {
  const form = new FormData();
  form.append("file", buffer, { filename, contentType: mimetype });
  Object.entries(fields).forEach(([k, v]) => form.append(k, String(v)));

  const { data } = await axios.post(`${PYTHON_URL}${endpoint}`, form, {
    headers: form.getHeaders(),
    timeout: 300_000, // 5 min — needed during first search after indexing
  });
  return data;
}

// ── POST /api/image-search/search ────────────────────────────────────────────
router.post("/search", upload.single("image"), async (req, res) => {
  console.log("📥 POST /api/image-search/search");
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No image provided" });
    }

    console.log(
      `📷 ${req.file.originalname} | ${req.file.mimetype} | ${req.file.size} bytes`,
    );

    const topK = parseInt(req.query.top_k) || 12;
    const data = await callPython(
      `/search?top_k=${topK}`,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
    );

    console.log(`✅ Python returned ${data.count} results`);

    // Pass warning to frontend if not indexed yet
    if (data.warning) {
      return res.json({
        success: false,
        message: data.warning,
        count: 0,
        results: [],
      });
    }

    res.json({ success: true, count: data.count, results: data.results });
  } catch (err) {
    console.error("❌ search error:", err.message);
    if (err.response) {
      console.error("   Python status:", err.response.status);
      console.error("   Python body  :", JSON.stringify(err.response.data));
    }
    if (err.code) {
      console.error("   Network code :", err.code);
    }
    res.status(500).json({
      success: false,
      message: "Search failed. Check Python service.",
    });
  }
});

// ── POST /api/image-search/index/all ─────────────────────────────────────────
router.post("/index/all", async (req, res) => {
  console.log("📥 POST /api/image-search/index/all");
  try {
    const { data } = await axios.post(
      `${PYTHON_URL}/index/all?force=${req.query.force === "true"}`,
      null,
      { timeout: 0 }, // no timeout — 40K images takes ~40 min
    );
    res.json(data);
  } catch (err) {
    console.error("❌ index/all error:", err.message);
    res.status(500).json({ success: false, message: "Bulk index failed" });
  }
});

// ── POST /api/image-search/index/single ──────────────────────────────────────
router.post("/index/single", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false });
    const data = await callPython(
      "/index/single",
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      {
        relative_path: req.body.relative_path || "",
        subfolder: req.body.subfolder || "",
      },
    );
    res.json(data);
  } catch (err) {
    console.error("❌ index/single error:", err.message);
    res.status(500).json({ success: false, message: "Index failed" });
  }
});

// ── GET /api/image-search/stats ───────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const { data } = await axios.get(`${PYTHON_URL}/stats`, { timeout: 8000 });
    res.json(data);
  } catch (err) {
    console.error("❌ stats error:", err.message);
    res.status(503).json({ message: "Python service not running" });
  }
});

// ── GET /api/image-search/health ─────────────────────────────────────────────
router.get("/health", async (req, res) => {
  try {
    const { data } = await axios.get(`${PYTHON_URL}/health`, { timeout: 5000 });
    res.json(data);
  } catch {
    res.status(503).json({ status: "Python service not running" });
  }
});

module.exports = router;
