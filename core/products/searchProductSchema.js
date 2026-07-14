// models/searchProductSchema.js

const mongoose = require("mongoose");

// Schema for each diamond in a product
const diamondSchema = new mongoose.Schema({
  diamond_colour: { type: String },
  diamond_clarity: { type: String },
  dia_wt: { type: Number },
  dia_amt: { type: Number },
  dia_size: { type: String },
  dia_rate: { type: Number },
  diamond_shape: { type: String },
  diamond_pcs: { type: Number },
});

const color_stoneSchema = new mongoose.Schema({
  stone_wt: { type: Number },
  stone_amt: { type: Number },
  stone_shape: { type: String },
  stone_pcs: { type: Number },
  stone_rate: { type: Number },
});

// Main product schema
const productSchema = new mongoose.Schema(
  {
    product_category: { type: String, required: true },
    sub_category: { type: String },
    quality_code: { type: String },
    jewel_code: { type: String, required: true, unique: true },
    material: { type: String }, // e.g., PL950, GW18
    mrp: { type: Number },
    metal_amt: { type: Number },
    making_charge: { type: Number },
    gross_wt: { type: Number },
    net_wt: { type: Number },
    diamonds: [diamondSchema], // Array of diamond entries
    stones: [color_stoneSchema],
    discount_amount: { type: Number },
    final_price: { type: Number },
    collection: { type: String },
    product_image_url: { type: String },
    gender: { type: String },
    making_amt: { type: Number },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  },
);

module.exports = mongoose.model("Product", productSchema);
