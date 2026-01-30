const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const Sold = require("../models/soldSchema");
const { verifyToken } = require("../middleware/jwt");
const authorizeRoles = require("../middleware/checkRoles");

// Create uploads folder if not exists
const uploadPath = path.join("uploads", "sold");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + file.originalname;
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

// POST - Create Sold Entry
router.post("/save", verifyToken, upload.any(), async (req, res) => {
  try {
    const { full_name, mobile, email, birthday, anniversary, address } =
      req.body;

    let products = [];
    if (req.body.products) {
      products = JSON.parse(req.body.products);

      // Attach file paths to products
      req.files.forEach((file) => {
        const match = file.fieldname.match(/^products\[(\d+)\]\[soldupload\]$/);
        if (match) {
          const index = parseInt(match[1], 10);
          if (products[index]) {
            products[index].soldupload =
              `${uploadPath}/${file.filename}`.replace(/\\/g, "/");
          }
        }
      });
    }

    const newSold = new Sold({
      full_name,
      mobile,
      email,
      birthday,
      anniversary,
      address,
      products,
      sales_staff: req.user.username,
    });

    await newSold.save();

    res.status(201).json({
      message: "Sold entry saved successfully",
      customer: newSold,
    });
  } catch (err) {
    console.error("Error saving sold entry:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// GET - All Sold Entries
router.get("/get", verifyToken, async (req, res) => {
  try {
    const { full_name, sales_staff } = req.query;
    let query = {};

    // Anyone can now search for any staff member's sold items
    if (sales_staff) {
      query.sales_staff = sales_staff;
    }
    if (full_name) {
      // Using regex for a flexible search (case-insensitive)
      query.full_name = { $regex: full_name, $options: "i" };
    }

    const soldItems = await Sold.find(query).sort({ createdAt: -1 }).lean();

    // Standard practice: return 200 even if empty
    res.status(200).json(soldItems);
  } catch (error) {
    console.error("Public Fetch Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET - Single Sold Entry
router.get("/view/:id", verifyToken, async (req, res) => {
  try {
    const customer = await Sold.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Sold customer not found" });
    }
    res.status(200).json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// PUT - Update Sold Entry
router.put("/update/:id", verifyToken, upload.any(), async (req, res) => {
  try {
    const customer = await Sold.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    let updatedProducts = [];
    if (req.body.products) {
      updatedProducts = JSON.parse(req.body.products);

      req.files.forEach((file) => {
        const match = file.fieldname.match(/^products\[(\d+)\]\[soldupload\]$/);
        if (match) {
          const index = parseInt(match[1], 10);
          if (updatedProducts[index]) {
            updatedProducts[index].soldupload =
              `${uploadPath}/${file.filename}`.replace(/\\/g, "/");
          }
        }
      });
    }

    customer.full_name = req.body.full_name || customer.full_name;
    customer.mobile = req.body.mobile || customer.mobile;
    customer.email = req.body.email || customer.email;
    customer.birthday = req.body.birthday || customer.birthday;
    customer.anniversary = req.body.anniversary || customer.anniversary;
    customer.address = req.body.address || customer.address;
    if (updatedProducts.length > 0) {
      customer.products = updatedProducts;
    }

    await customer.save();

    res.status(200).json({
      message: "Customer updated successfully",
      customer,
    });
  } catch (error) {
    console.error("Error updating sold entry:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const customer = await Sold.findByIdAndDelete(req.params.id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.status(200).json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
