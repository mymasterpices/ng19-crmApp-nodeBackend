const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      require: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    mobile: {
      type: String,
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    nextFollowUpDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["Open", "Cold", "Close"],
      default: "open",
    },
    productImage: {
      type: String,
      required: true,
    },
    seriousness: {
      type: String,
      enum: ["High", "Low", "Neutral"],
      default: "Neutral",
    },
    newcustomer: {
      type: Boolean,
      default: false,
    },
    conversation: {
      type: String,
      default: "",
    },
    salesperson: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Customer", customerSchema);
