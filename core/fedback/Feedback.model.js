const mongoose = require("mongoose");


const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const feedbackSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: [true, "Mobile number is required"],
      trim: true,
      index: true,
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

module.exports = mongoose.model("Feedback", feedbackSchema);
