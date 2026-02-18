const mongoose = require("mongoose");

// Jewelry Order Schema
const JewelryOrderSchema = new mongoose.Schema({
  party: { type: String, required: true },
  orderNumber: { type: String, required: true, unique: true },
  karigari: { type: String },
  imageProduct: { type: String },
  deliveryDate: { type: Date, required: true },
  quantity: { type: Number, required: true },
  salesperson: { type: String },
  goldWeight: { type: String, required: true },
  gatiOrderNo: { type: String },
  itemCategory: { type: String, required: true },
  purity: { type: String, required: true },
  goldColor: { type: String },
  diamondDetails: { type: String },
  stoneDetails: { type: String },
  productCode: { type: String },
  size: { type: String },
  remarks: { type: String },
  status: {
    type: String,
    enum: ["hold", "issued", "received", "cancelled", "dispatched", "WIP"],
    lowercase: true,
    default: "issued",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("JewelryOrder", JewelryOrderSchema);
