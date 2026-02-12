const express = require("express");
const JewelryOrder = require("../../models/orders/ordersSchema");
const Counter = require("../../models/counterSchema");
const multer = require("multer");
const { verifyToken } = require("../../middleware/jwt");
const router = express.Router();
const fs = require("fs");

// Ensure directory exists (prevents multer error if folder is missing)
const uploadDir = "uploads/orders/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

router.post(
  "/create",
  verifyToken, // 1. Verify user first
  upload.single("productImage"), // 2. Match the key from Angular FormData
  async (req, res) => {
    try {
      // Check if file exists
      if (!req.file) {
        return res.status(400).json({ message: "Please upload an image file" });
      }

      const counter = await Counter.findOneAndUpdate(
        { id: "orderId" },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }, // Create if doesn't exist
      );

      // 2. Format the sequence (e.g., 2 -> "RK0002")
      // padStart(4, '0') ensures it is always 4 digits
      const sequenceNumber = counter.seq.toString().padStart(4, "0");
      const customOrderId = `RK${sequenceNumber}`;

      // 3. Create the order with the generated ID
      const newOrder = new JewelryOrder({
        ...req.body,
        orderNumber: customOrderId, // Add this to your Schema first!
        imageProduct: req.file.path.replace(/\\/g, "/"), // Stores the path string in DB
      });

      // 4. Save the instance
      const savedOrder = await newOrder.save();

      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: savedOrder,
      });
    } catch (error) {
      // 5. Cleanup: If DB save fails, delete the uploaded file so you don't waste storage
      if (req.file) fs.unlinkSync(req.file.path);

      console.error("Error creating order:", error);
      res.status(500).json({
        message: "Internal server error",
        error: error.message,
      });
    }
  },
);

//get all orders with params
router.get("/get", verifyToken, async (req, res) => {
  try {
    // 1. Destructure search terms from query
    const { orderNumber, customer, party, salesperson, status, id } = req.query;

    let query = {};

    // 2. Build Case-Insensitive filters
    if (orderNumber) {
      query.orderNumber = { $regex: orderNumber, $options: "i" };
    }
    if (customer) {
      query.customer = { $regex: customer, $options: "i" };
    }
    if (party) {
      query.party = { $regex: party, $options: "i" };
    }
    if (salesperson) {
      query.salesperson = { $regex: salesperson, $options: "i" };
    }
    if (status) {
      query.status = { $regex: status, $options: "i" };
    }
    if (id) {
      query._id = id; // Exact match for ID
    }

    // 3. Find ALL matching orders (No limit/skip)
    const orders = await JewelryOrder.find(query).sort({ timestamp: -1 });

    // 4. Return the array directly
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
});

//update order status
router.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const orderId = req.params.id;
    const { status } = req.body;
    const updatedOrder = await JewelryOrder.findByIdAndUpdate(
      orderId,
      { status },
      { new: true },
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
});

// Change the route back to /edit or keep /edit/:id, but match the logic!
router.put(
  "/edit/:id", // Path Parameter
  verifyToken,
  upload.single("productImage"),
  async (req, res) => {
    try {
      // FIX: Use req.params because your route has ":id"
      const orderId = req.params.id;

      if (!orderId) {
        return res.status(400).json({ message: "Order ID is required" });
      }

      const existingOrder = await JewelryOrder.findById(orderId);
      if (!existingOrder) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ message: "Order not found" });
      }

      let updateData = { ...req.body };
      delete updateData.orderNumber;
      delete updateData._id;
      delete updateData.timestamp;

      if (req.file) {
        updateData.imageProduct = req.file.path.replace(/\\/g, "/");
        if (
          existingOrder.imageProduct &&
          fs.existsSync(existingOrder.imageProduct)
        ) {
          try {
            fs.unlinkSync(existingOrder.imageProduct);
          } catch (err) {
            console.error("Old image cleanup failed:", err);
          }
        }
      }

      const updatedOrder = await JewelryOrder.findByIdAndUpdate(
        orderId,
        { $set: updateData },
        { new: true, runValidators: true },
      );

      res.status(200).json({
        success: true,
        message: "Order updated successfully",
        data: updatedOrder,
      });
    } catch (error) {
      if (req.file) fs.unlinkSync(req.file.path);
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
);

module.exports = router;
