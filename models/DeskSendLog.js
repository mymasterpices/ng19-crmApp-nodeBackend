// backend/models/DeskSendLog.js
// Spec §7: every send is logged — enquiry, template, Jewel Codes, time, executive.
const { Schema, model } = require('mongoose');

const SendLogSchema = new Schema(
  {
    uid: { type: String, required: true, unique: true, match: /^[\w-]{8,64}$/ }, // idempotency key
    enquiryUid: { type: String, required: true, index: true },
    template: { type: String, enum: ['options', 'nudge', 'details', 'price'], required: true },
    codes: { type: [String], default: [] },
    at: { type: Number, required: true, index: true }, // ms epoch
    executive: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    executiveName: { type: String, default: '' },
  },
  { timestamps: true },
);

SendLogSchema.set('toJSON', {
  transform: (_doc, ret) => ({
    id: ret.uid,
    enquiryId: ret.enquiryUid,
    template: ret.template,
    codes: ret.codes,
    at: ret.at,
    executive: ret.executiveName || String(ret.executive),
  }),
});

module.exports = model('DeskSendLog', SendLogSchema);
