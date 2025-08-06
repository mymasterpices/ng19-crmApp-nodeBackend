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
    address: {
      type: String,
    },
    tag: {
      type: String,
    },
    purity: {
      type: String,
    },
    gold_wt: {
      type: String,
    },
    dia_wt: {
      type: String,
    },
    stn_wt: {
      type: String,
    },
    amount: {
      type: Number,
    },
    soldupload: {
      type: String, // stores file path or filename
    },
    sales_staff: {
      type: String,
    },
  },
  {
    timestamps: true,
    imutable: true,
  }
);

module.exports = mongoose.model("Sold", soldSchema);
