// backend/routes/desk.routes.js
//
// Mount in your app:   app.use('/api/desk', require('./routes/desk.routes'));
//
// Auth (verifyToken) and viewerReadOnly are applied in app.js when this router is mounted.
// ASSUMPTION (adjust the helpers marked ★ if your JWT payload differs):
//  ★ req.user has _id (or id), role ('admin' | 'user' | ...) and name
const express = require("express");
const Enquiry = require("../models/Enquiry");
const DeskSendLog = require("../models/DeskSendLog");
const DeskMarketRule = require("../models/DeskMarketRule");

const router = express.Router();

// ---------------------------------------------------------------- helpers
const asyncH = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const userId = (req) => req.user._id || req.user.id; // ★
const userName = (req) =>
  req.user.name || req.user.username || req.user.email || ""; // ★
const isAdmin = (req) =>
  ["admin", "superadmin"].includes(String(req.user.role || "").toLowerCase()); // ★

const requireAdmin = (req, res, next) =>
  isAdmin(req) ? next() : res.status(403).json({ message: "Admin only" });

const UID = /^[\w-]{8,64}$/;
const CHANNELS = Enquiry.CHANNELS;
const MARKETS = Enquiry.MARKETS;
const MAKES = ["", "Diamond", "Polki", "Gold", "Gemstone"];
const TEMPLATES = ["options", "nudge", "details", "price"];
const MAX_PICKS = 6;
const FILTER_KEYS = [
  "brand",
  "category",
  "sub",
  "make",
  "occasion",
  "budget",
  "goldWt",
  "diaWt",
  "avail",
  "gender",
  "metal",
  "purity",
  "collection",
  "stone_type",
];

const str = (v, max = 500) => (typeof v === "string" ? v.slice(0, max) : "");
const num = (v, fallback = null) =>
  Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : fallback;

function cleanFilters(f) {
  const out = {};
  const src = f && typeof f === "object" ? f : {};
  for (const k of FILTER_KEYS) out[k] = str(src[k], 120);
  if (!MAKES.includes(out.make)) out.make = "";
  if (!/^\d+(\.\d+)?-\d+(\.\d+)?$/.test(out.budget)) out.budget = "";
  if (!/^\d+(\.\d+)?-\d+(\.\d+)?$/.test(out.goldWt)) out.goldWt = "";
  if (!/^\d+(\.\d+)?-\d+(\.\d+)?$/.test(out.diaWt)) out.diaWt = "";
  out.avail = src.avail === "all" ? "all" : "store";
  return out;
}

/** Whitelist + clamp. Only fields present in the body are returned, so PUT acts as a patch. */
function cleanEnquiry(b = {}) {
  const out = {};
  if ("name" in b) out.name = str(b.name, 120).trim();
  if ("phone" in b) out.phone = str(b.phone, 30).trim();
  if ("channel" in b && CHANNELS.includes(b.channel)) out.channel = b.channel;
  if ("market" in b && MARKETS.includes(b.market)) out.market = b.market;
  if ("need" in b) out.need = str(b.need, 500);
  if ("occasion" in b) out.occasion = str(b.occasion, 60);
  if ("stage" in b)
    out.stage = Math.min(5, Math.max(0, parseInt(b.stage, 10) || 0));
  if ("sentAt" in b) out.sentAt = b.sentAt == null ? null : num(b.sentAt);
  if ("picked" in b && Array.isArray(b.picked)) {
    out.picked = [
      ...new Set(
        b.picked
          .filter((c) => typeof c === "string")
          .map((c) => c.slice(0, 60)),
      ),
    ].slice(0, MAX_PICKS);
  }
  if ("q" in b) out.q = str(b.q, 300);
  if ("f" in b) out.f = cleanFilters(b.f);
  return out;
}

/** Upsert one enquiry for the current user. Retries once on a concurrent-upsert duplicate-key race. */
async function upsertEnquiry(req, uid, body) {
  const owner = userId(req);
  const run = () =>
    Enquiry.findOneAndUpdate(
      { owner, uid },
      {
        $set: cleanEnquiry(body),
        $setOnInsert: {
          ownerName: userName(req),
          clientCreatedAt: num(body.createdAt, Date.now()),
        },
      },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    );
  try {
    return await run();
  } catch (e) {
    if (e.code === 11000) return run();
    throw e;
  }
}

// ================================================================ ENQUIRIES
// READ  — my enquiries (admin: ?all=true for everyone's)
router.get(
  "/enquiries",
  asyncH(async (req, res) => {
    const filter =
      isAdmin(req) && req.query.all === "true" ? {} : { owner: userId(req) };
    const list = await Enquiry.find(filter)
      .sort({ clientCreatedAt: -1 })
      .limit(500);
    res.json(list);
  }),
);

// BULK UPSERT — first-time migration from localStorage + offline catch-up
router.post(
  "/enquiries/sync",
  asyncH(async (req, res) => {
    const items = Array.isArray(req.body?.enquiries)
      ? req.body.enquiries.slice(0, 200)
      : [];
    const owner = userId(req);
    const ops = items
      .filter((e) => e && UID.test(String(e.id)))
      .map((e) => ({
        updateOne: {
          filter: { owner, uid: e.id },
          update: {
            $set: cleanEnquiry(e),
            $setOnInsert: {
              ownerName: userName(req),
              clientCreatedAt: num(e.createdAt, Date.now()),
            },
          },
          upsert: true,
        },
      }));
    if (ops.length) await Enquiry.bulkWrite(ops, { ordered: false });
    res.json({ synced: ops.length });
  }),
);

// READ ONE
router.get(
  "/enquiries/:uid",
  asyncH(async (req, res) => {
    const doc = await Enquiry.findOne({
      owner: userId(req),
      uid: req.params.uid,
    });
    if (!doc) return res.status(404).json({ message: "Enquiry not found" });
    res.json(doc);
  }),
);

// CREATE / UPDATE (idempotent upsert; body may be partial)
router.put(
  "/enquiries/:uid",
  asyncH(async (req, res) => {
    if (!UID.test(req.params.uid))
      return res.status(400).json({ message: "Invalid enquiry id" });
    res.json(await upsertEnquiry(req, req.params.uid, req.body || {}));
  }),
);

// CREATE (same as PUT, for clients that prefer POST)
router.post(
  "/enquiries",
  asyncH(async (req, res) => {
    const uid = String(req.body?.id || "");
    if (!UID.test(uid))
      return res.status(400).json({ message: "id (uuid) is required" });
    res.status(201).json(await upsertEnquiry(req, uid, req.body));
  }),
);

// DELETE — idempotent (deleting something already gone is still a success).
// Send logs are kept on purpose: they feed the spec §7 reports.
router.delete(
  "/enquiries/:uid",
  asyncH(async (req, res) => {
    const filter = { uid: req.params.uid };
    if (!(isAdmin(req) && req.query.any === "true")) filter.owner = userId(req);
    const r = await Enquiry.deleteOne(filter);
    res.json({ deleted: r.deletedCount });
  }),
);

// ================================================================ SEND LOGS
// WRITE — idempotent on `id`, executive always taken from the token (never the body)
router.post(
  "/send-logs",
  asyncH(async (req, res) => {
    const b = req.body || {};
    const uid = String(b.id || "");
    if (!UID.test(uid))
      return res.status(400).json({ message: "id (uuid) is required" });
    if (!TEMPLATES.includes(b.template))
      return res.status(400).json({ message: "Invalid template" });
    if (!UID.test(String(b.enquiryId || "")))
      return res.status(400).json({ message: "enquiryId is required" });

    await DeskSendLog.updateOne(
      { uid },
      {
        $setOnInsert: {
          enquiryUid: b.enquiryId,
          template: b.template,
          codes: Array.isArray(b.codes)
            ? b.codes.filter((c) => typeof c === "string").slice(0, 20)
            : [],
          at: num(b.at, Date.now()),
          executive: userId(req),
          executiveName: userName(req),
        },
      },
      { upsert: true },
    );
    res.status(201).json({ ok: true });
  }),
);

// READ — mine by default; admin can pass ?all=true. Filters: enquiryId, template, from, to (ms epoch), limit
router.get(
  "/send-logs",
  asyncH(async (req, res) => {
    const q = {};
    if (!(isAdmin(req) && req.query.all === "true")) q.executive = userId(req);
    if (req.query.enquiryId) q.enquiryUid = String(req.query.enquiryId);
    if (TEMPLATES.includes(req.query.template)) q.template = req.query.template;
    if (req.query.from || req.query.to) {
      q.at = {};
      if (num(req.query.from) != null) q.at.$gte = num(req.query.from);
      if (num(req.query.to) != null) q.at.$lte = num(req.query.to);
    }
    const limit = Math.min(
      1000,
      Math.max(1, parseInt(req.query.limit, 10) || 200),
    );
    res.json(await DeskSendLog.find(q).sort({ at: -1 }).limit(limit));
  }),
);

// DELETE — admin only
router.delete(
  "/send-logs/:uid",
  requireAdmin,
  asyncH(async (req, res) => {
    const r = await DeskSendLog.deleteOne({ uid: req.params.uid });
    res.json({ deleted: r.deletedCount });
  }),
);

// ================================================================ MARKET RULES
const isRule = (r) =>
  r &&
  typeof r.cur === "string" &&
  r.cur.length <= 8 &&
  (r.mult === null ||
    (typeof r.mult === "number" && r.mult > 0 && r.mult < 1000)) &&
  (r.extras === null || typeof r.extras === "string");

router.get(
  "/market-rules",
  asyncH(async (_req, res) => {
    const doc = await DeskMarketRule.findOne({ key: "default" });
    res.json({ rules: doc?.rules || DeskMarketRule.DEFAULT_RULES });
  }),
);

router.put(
  "/market-rules",
  requireAdmin,
  asyncH(async (req, res) => {
    const rules = req.body?.rules;
    if (!rules || !MARKETS.every((m) => isRule(rules[m]))) {
      return res
        .status(400)
        .json({
          message: "rules must define cur, mult, extras for every market",
        });
    }
    const clean = {};
    for (const m of MARKETS) {
      const { cur, mult, extras } = rules[m];
      clean[m] = { cur, mult, extras: extras ? extras.slice(0, 60) : null };
    }
    const doc = await DeskMarketRule.findOneAndUpdate(
      { key: "default" },
      { $set: { rules: clean, updatedBy: userId(req) } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json({ rules: doc.rules });
  }),
);

module.exports = router;
