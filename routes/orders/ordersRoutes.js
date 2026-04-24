const express = require("express");
const JewelryOrder = require("../../models/orders/ordersSchema");
const multer = require("multer");
const { verifyToken } = require("../../middleware/jwt");
const router = express.Router();
const fs = require("fs");

const uploadDir = "uploads/orders/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

// ✅ Accept up to 10 images with field name "productImages"
const upload = multer({ storage });

// ── CREATE ─────────────────────────────────────────────────────────────────
router.post(
  "/create",
  verifyToken,
  upload.array("productImages", 10),
  async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res
          .status(400)
          .json({ message: "Please upload at least one image" });
      }

      // Build order number
      const lastOrder = await JewelryOrder.findOne({}, { orderNumber: 1 })
        .sort({ orderNumber: -1 })
        .limit(1);

      let nextSeq = 1;
      if (lastOrder?.orderNumber) {
        const lastNumber = parseInt(
          lastOrder.orderNumber.replace("RK", ""),
          10,
        );
        if (!isNaN(lastNumber)) nextSeq = lastNumber + 1;
      }

      const customOrderId = `RK${nextSeq.toString().padStart(4, "0")}`;

      // ✅ Save array of image paths
      const imagePaths = req.files.map((f) => f.path.replace(/\\/g, "/"));

      const newOrder = new JewelryOrder({
        ...req.body,
        orderNumber: customOrderId,
        imageProduct: imagePaths,
      });

      const savedOrder = await newOrder.save();

      res.status(201).json({
        success: true,
        message: "Order created successfully",
        data: savedOrder,
      });
    } catch (error) {
      // Cleanup uploaded files on error
      if (req.files) {
        req.files.forEach((f) => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }

      if (error.code === 11000) {
        return res
          .status(409)
          .json({ message: "Order number conflict. Please try again." });
      }

      console.error("Error creating order:", error);
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
);

// ── GET ALL ────────────────────────────────────────────────────────────────
router.get("/get", verifyToken, async (req, res) => {
  try {
    const { orderNumber, customer, party, salesperson, status, id, karigari } =
      req.query;

    let query = {};
    if (orderNumber) query.orderNumber = { $regex: orderNumber, $options: "i" };
    if (customer) query.customer = { $regex: customer, $options: "i" };
    if (party) query.party = { $regex: party, $options: "i" };
    if (salesperson) query.salesperson = { $regex: salesperson, $options: "i" };
    if (status) query.status = { $regex: status, $options: "i" };
    if (karigari) query.karigari = { $regex: karigari, $options: "i" };
    if (id) query._id = id;

    const orders = await JewelryOrder.find(query).sort({ timestamp: -1 });
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// ── UPDATE STATUS ──────────────────────────────────────────────────────────
router.put("/update/:id", verifyToken, async (req, res) => {
  try {
    const updatedOrder = await JewelryOrder.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true },
    );

    if (!updatedOrder)
      return res.status(404).json({ message: "Order not found" });

    res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// ── EDIT ORDER ─────────────────────────────────────────────────────────────
router.put(
  "/edit/:id",
  verifyToken,
  upload.array("productImages", 10),
  async (req, res) => {
    try {
      const orderId = req.params.id;
      if (!orderId)
        return res.status(400).json({ message: "Order ID is required" });

      const existingOrder = await JewelryOrder.findById(orderId);
      if (!existingOrder) {
        if (req.files) req.files.forEach((f) => fs.unlinkSync(f.path));
        return res.status(404).json({ message: "Order not found" });
      }

      let updateData = { ...req.body };
      delete updateData.orderNumber;
      delete updateData._id;
      delete updateData.timestamp;

      if (req.files && req.files.length > 0) {
        // ✅ Delete old images from disk
        if (existingOrder.imageProduct?.length) {
          existingOrder.imageProduct.forEach((imgPath) => {
            if (fs.existsSync(imgPath)) {
              try {
                fs.unlinkSync(imgPath);
              } catch (e) {
                console.error("Cleanup failed:", e);
              }
            }
          });
        }
        // ✅ Save new image paths
        updateData.imageProduct = req.files.map((f) =>
          f.path.replace(/\\/g, "/"),
        );
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
      if (req.files)
        req.files.forEach((f) => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      res
        .status(500)
        .json({ message: "Internal server error", error: error.message });
    }
  },
);

module.exports = router;
