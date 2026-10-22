const mongoose = require("mongoose");

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const feedbackSchema = new mongoose.Schema(
  {
    // Stored separately from the mobile, e.g. countryCode "+91", mobile "9876543210".
    // Records saved before this change have neither field; the routes treat
    // those as India (+91), so no migration is required.
    countryCode: {
      type: String,
      trim: true,
      default: "+91",
      match: [/^\+\d{1,4}$/, "Invalid country code"],
    },
    countryIso: {
      type: String,
      trim: true,
      uppercase: true,
      default: "IN",
      match: [/^[A-Z]{2}$/, "Invalid country"],
    },
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
    },
    name: { type: String, trim: true, maxlength: 100 },
    address: { type: String, trim: true, maxlength: 500 },
    dob: { type: Date, default: null },
    anniversary: { type: Date, default: null },
    pan: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
      validate: {
        validator: (v) => !v || PAN_REGEX.test(v),
        message: "PAN must look like ABCDE1234F",
      },
    },
    rating: { type: Number, min: 1, max: 5, default: null },
    remarks: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// Fast "latest feedback for this country + number" lookups.
// Not unique, because the lookup returns the latest record per number.
feedbackSchema.index({ countryCode: 1, mobile: 1, createdAt: -1 });
// Keeps searches by number alone (any country) fast
feedbackSchema.index({ mobile: 1 });

module.exports = mongoose.model("Feedback", feedbackSchema);
