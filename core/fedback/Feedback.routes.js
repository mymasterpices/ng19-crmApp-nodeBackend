const express = require("express");
const mongoose = require("mongoose");
const Feedback = require("./Feedback.model");
const { syncFeedbackToSheet } = require("../../services/googleSheet.service");

const router = express.Router();

const DEFAULT_COUNTRY_CODE = "+91";
const DEFAULT_COUNTRY_ISO = "IN";

// Only allow known fields through (blocks mass-assignment of _id, timestamps, etc.)
const FIELDS = [
  "countryCode",
  "countryIso",
  "mobile",
  "name",
  "address",
  "dob",
  "anniversary",
  "pan",
  "rating",
  "remarks",
];

const pick = (body) => {
  const out = FIELDS.reduce((acc, key) => {
    if (body[key] !== undefined) acc[key] = body[key] === "" ? null : body[key];
    return acc;
  }, {});

  // Never store an empty country: drop it so the schema default (+91 / IN)
  // applies on create, and the existing value is kept on update.
  if (!out.countryCode) delete out.countryCode;
  if (!out.countryIso) delete out.countryIso;

  // Normalise: "91" -> "+91"
  if (out.countryCode) {
    const digits = String(out.countryCode).replace(/[^\d]/g, "");
    out.countryCode = `+${digits}`;
  }
  return out;
};

/**
 * Query fragment matching a country code.
 * Old records have no countryCode at all, so for +91 they are included too.
 * This is what makes search work for both old and new data.
 */
const countryMatch = (countryCode) =>
  countryCode === DEFAULT_COUNTRY_CODE
    ? {
        $or: [
          { countryCode: DEFAULT_COUNTRY_CODE },
          { countryCode: { $exists: false } },
          { countryCode: null },
        ],
      }
    : { countryCode };

/** Read + normalise a country code from a query string ("+91", "91", " 91") */
const readCountryCode = (value) => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits ? `+${digits}` : DEFAULT_COUNTRY_CODE;
};

const validateId = (req, res, next) =>
  mongoose.isValidObjectId(req.params.id)
    ? next()
    : res.status(400).json({ message: "Invalid feedback id" });

// Wrap async handlers so errors reach the error middleware below
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/feedback -> create
router.post(
  "/",
  wrap(async (req, res) => {
    const doc = await Feedback.create(pick(req.body));
    syncFeedbackToSheet(doc, "create"); // not awaited, so the response isn't delayed
    res.status(201).json(doc);
  }),
);

// POST /api/feedback/bulk -> import an ARRAY of records in one request
router.post(
  "/bulk",
  wrap(async (req, res) => {
    const items = Array.isArray(req.body)
      ? req.body
      : req.body && req.body.items;
    if (!Array.isArray(items) || !items.length) {
      return res
        .status(400)
        .json({ message: "Send a JSON array of feedback records" });
    }

    const toDate = (v) => {
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d) ? null : d;
    };

    const docs = [];
    const failed = [];

    for (let i = 0; i < items.length; i++) {
      const data = pick(items[i] || {});
      if (data.rating !== undefined && data.rating !== null)
        data.rating = Number(data.rating);

      const doc = new Feedback(data);
      try {
        await doc.validate();
      } catch (err) {
        failed.push({
          index: i,
          name: items[i] && items[i].name,
          mobile: items[i] && items[i].mobile,
          errors: Object.fromEntries(
            Object.entries(err.errors || {}).map(([k, v]) => [k, v.message]),
          ),
        });
        continue;
      }

      const createdAt = toDate(items[i].createdAt) || new Date();
      const updatedAt = toDate(items[i].updatedAt) || createdAt;
      docs.push({
        countryCode: doc.countryCode, // schema default applies when missing
        countryIso: doc.countryIso,
        mobile: doc.mobile,
        name: doc.name ?? null,
        address: doc.address ?? null,
        dob: doc.dob ?? null,
        anniversary: doc.anniversary ?? null,
        pan: doc.pan ?? null,
        rating: doc.rating ?? null,
        remarks: doc.remarks ?? null,
        createdAt,
        updatedAt,
        __v: 0,
      });
    }

    if (docs.length)
      await Feedback.collection.insertMany(docs, { ordered: false });
    res
      .status(201)
      .json({ received: items.length, inserted: docs.length, failed });
  }),
);

// GET /api/feedback?page=1&limit=20&mobile=9876543210&countryCode=%2B91&rating=5
// - mobile only            -> matches that number in every country (old + new)
// - mobile + countryCode   -> matches that country; +91 also includes old records
router.get(
  "/",
  wrap(async (req, res) => {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(
      Math.max(parseInt(req.query.limit, 10) || 20, 1),
      100,
    );

    const filter = {};
    if (req.query.mobile) filter.mobile = String(req.query.mobile).trim();
    if (req.query.countryCode)
      Object.assign(
        filter,
        countryMatch(readCountryCode(req.query.countryCode)),
      );
    if (req.query.rating) filter.rating = Number(req.query.rating);

    const [items, total] = await Promise.all([
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Feedback.countDocuments(filter),
    ]);

    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  }),
);

// GET /api/feedback/by-mobile/:mobile?countryCode=%2B91
// Latest feedback for that number in that country (404 if none).
// Old records (no countryCode) are found under +91.
// NOTE: must stay above "/:id" or "by-mobile" would be treated as an id
router.get(
  "/by-mobile/:mobile",
  wrap(async (req, res) => {
    const mobile = String(req.params.mobile).trim();
    const countryCode = readCountryCode(req.query.countryCode);

    // India keeps its strict format; other countries get a generic digit check
    const valid =
      countryCode === DEFAULT_COUNTRY_CODE
        ? /^[6-9]\d{9}$/.test(mobile)
        : /^\d{4,14}$/.test(mobile);
    if (!valid) {
      return res.status(400).json({ message: "Invalid mobile number" });
    }

    const doc = await Feedback.findOne({
      mobile,
      ...countryMatch(countryCode),
    }).sort({ createdAt: -1 });

    if (!doc)
      return res
        .status(404)
        .json({ message: "No feedback found for this mobile" });
    res.json(doc);
  }),
);

// GET /api/feedback/:id
router.get(
  "/:id",
  validateId,
  wrap(async (req, res) => {
    const doc = await Feedback.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Feedback not found" });
    res.json(doc);
  }),
);

// PUT /api/feedback/:id
// Updating an old record also stamps it with the country sent by the form,
// so old data gets its countryCode the first time it is edited.
router.put(
  "/:id",
  validateId,
  wrap(async (req, res) => {
    const doc = await Feedback.findByIdAndUpdate(
      req.params.id,
      pick(req.body),
      {
        new: true,
        runValidators: true,
      },
    );
    if (!doc) return res.status(404).json({ message: "Feedback not found" });
    syncFeedbackToSheet(doc, "update");
    res.json(doc);
  }),
);

// DELETE /api/feedback/:id
router.delete(
  "/:id",
  validateId,
  wrap(async (req, res) => {
    const doc = await Feedback.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Feedback not found" });
    res.status(204).end();
  }),
);

// Route-level error handler: Mongoose validation -> 400, everything else -> 500
router.use((err, req, res, next) => {
  if (err.name === "ValidationError") {
    const errors = Object.fromEntries(
      Object.entries(err.errors).map(([k, v]) => [k, v.message]),
    );
    return res.status(400).json({ message: "Validation failed", errors });
  }
  console.error(err);
  res.status(500).json({ message: "Something went wrong" });
});

module.exports = router;
