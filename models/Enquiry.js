// backend/models/Enquiry.js
const { Schema, model } = require('mongoose');

const CHANNELS = ['WhatsApp', 'Call', 'Instagram', 'Walk-in follow-up'];
const MARKETS = ['India', 'UAE', 'Qatar', 'Saudi', 'Bahrain', 'Kuwait'];

const EnquirySchema = new Schema(
  {
    // Client-generated UUID. Makes every write an idempotent upsert, so the
    // browser can save instantly and safely retry after being offline.
    uid: { type: String, required: true, match: /^[\w-]{8,64}$/ },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerName: { type: String, default: '' },

    name: { type: String, default: '', maxlength: 120, trim: true },
    phone: { type: String, default: '', maxlength: 30, trim: true },
    channel: { type: String, enum: CHANNELS, default: 'WhatsApp' },
    market: { type: String, enum: MARKETS, default: 'India' },
    need: { type: String, default: '', maxlength: 500 },
    occasion: { type: String, default: '', maxlength: 60 },

    stage: { type: Number, min: 0, max: 5, default: 0 },
    sentAt: { type: Number, default: null }, // ms epoch of last options/nudge send (24-hr timer)
    picked: { type: [String], default: [] }, // Jewel Codes, max 6 (route enforces)

    q: { type: String, default: '', maxlength: 300 }, // remembered search text
    // Remembered filters. Mixed (not a sub-schema) because one key is named
    // `collection`, which Mongoose reserves as a schema path name.
    f: { type: Schema.Types.Mixed, default: {} },

    clientCreatedAt: { type: Number, default: () => Date.now() },
  },
  { timestamps: true },
);

EnquirySchema.index({ owner: 1, uid: 1 }, { unique: true });
EnquirySchema.index({ owner: 1, clientCreatedAt: -1 });

// Shape the JSON exactly like the Angular `Enquiry` interface.
EnquirySchema.set('toJSON', {
  transform: (_doc, ret) => ({
    id: ret.uid,
    name: ret.name,
    phone: ret.phone,
    channel: ret.channel,
    market: ret.market,
    need: ret.need,
    occasion: ret.occasion,
    stage: ret.stage,
    sentAt: ret.sentAt ?? null,
    picked: ret.picked,
    q: ret.q,
    f: ret.f,
    createdAt: ret.clientCreatedAt,
    ownerName: ret.ownerName,
  }),
});

module.exports = model('Enquiry', EnquirySchema);
module.exports.CHANNELS = CHANNELS;
module.exports.MARKETS = MARKETS;
