// models/searchProductSchema.js

const mongoose = require("mongoose");

// Schema for each diamond in a product
const diamondSchema = new mongoose.Schema({
  diamond_colour: { type: String },
  quality_code: { type: String },
  weight: { type: Number },
  amount: { type: Number },
});

const color_stoneSchema = new mongoose.Schema({
  colour_stone_wt: { type: Number },
  colour_stone_amt: { type: Number },
});

// Main product schema
const productSchema = new mongoose.Schema(
  {
    product_category: { type: String, required: true },
    sub_category: { type: String },
    jewel_code: { type: String, required: true, unique: true },
    material: { type: String }, // e.g., PL950, GW18
    mrp: { type: Number },
    gross_wt: { type: Number },
    net_wt: { type: Number },
    diamonds: [diamondSchema], // Array of diamond entries
    stones: [color_stoneSchema],
    discount_amount: { type: Number },
    final_price: { type: Number },
    collection: { type: String },
    product_image_url: { type: String },
    gender: { type: String },
    metal_amt: { type: Number },
    making_charge: { type: Number },
    making_amt: { type: Number },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt
  }
);

module.exports = mongoose.model("Product", productSchema);
