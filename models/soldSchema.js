const mongoose = require("mongoose");

const soldSchema = new mongoose.Schema(
  {
    full_name: {
      type: String,
      required: true,
    },
    mobile: {
      type: String,
      match: /^[0-9]{1,15}$/,
    },
    email: {
      type: String,
    },
    birthday: {
      type: Date,
    },
    anniversary: {
      type: Date,
    },

    // ✅ Swarnteras fields
    isSwarnteras: {
      type: Boolean,
      default: false,
    },
    swanrAmount: {
      type: Number,
      default: null,
    },

    products: [
      {
        tag: { type: String, required: true },
        purity: { type: String },
        gold_wt: { type: String },
        dia_wt: { type: String },
        stn_wt: { type: String },
        soldupload: { type: String },
      },
    ],
    sales_staff: {
      type: String,
    },
  },
  {
    timestamps: true,
    immutable: true,
  },
);

module.exports = mongoose.model("Sold", soldSchema);
