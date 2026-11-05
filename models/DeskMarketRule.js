// backend/models/DeskMarketRule.js
// One settings document so management can change multipliers without a release (spec §5).
const { Schema, model } = require('mongoose');

const DEFAULT_RULES = {
  India: { cur: '₹', mult: null, extras: null },
  UAE: { cur: 'AED', mult: 14, extras: 'Shipping + VAT' },
  Qatar: { cur: 'QAR', mult: 14, extras: 'Shipping + VAT' },
  Saudi: { cur: 'SAR', mult: 16, extras: 'Shipping + VAT' },
  Bahrain: { cur: 'BHD', mult: 1.4, extras: 'Shipping + VAT' },
  Kuwait: { cur: 'KD', mult: 1, extras: 'Shipping + Duty' },
};

const MarketRuleSchema = new Schema(
  {
    key: { type: String, default: 'default', unique: true },
    rules: { type: Schema.Types.Mixed, default: () => DEFAULT_RULES },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

module.exports = model('DeskMarketRule', MarketRuleSchema);
module.exports.DEFAULT_RULES = DEFAULT_RULES;
