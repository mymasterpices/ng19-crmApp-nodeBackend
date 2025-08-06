const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

const Sold = require("../models/soldSchema");
const { verifyToken } = require("../middleware/jwt"); // make sure this exists

// Create folder if not exists
const fs = require("fs");
const uploadPath = "uploads/sold";
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Configure Multer
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

// @route POST /api/sold/save
// @desc Add new sold customer with file upload
router.post(
  "/save",
  verifyToken,
  upload.single("soldupload"), // 👈 this field name MUST match FormData field in Angular
  async (req, res) => {
    try {
      const {
        full_name,
        mobile,
        email,
        birthday,
        anniversary,
        address,
        tag,
        purity,
        gold_wt,
        dia_wt,
        stn_wt,
        amount,
      } = req.body;

      if (!req.file) {
        return res.status(400).json({ message: "Please upload an image file" });
      }

      const newSold = new Sold({
        full_name,
        mobile,
        email,
        birthday,
        anniversary,
        address,
        tag,
        purity,
        gold_wt,
        dia_wt,
        stn_wt,
        amount,
        soldupload: `${uploadPath}/${req.file.filename}`.replace(/\\/g, "/"),

        sales_staff: req.user.username, // assuming `verifyToken` sets `req.user`
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
  }
);

// @route GET /api/sold/get
router.get("/get", verifyToken, async (req, res) => {
  try {
    const customers = await Sold.find(req.query);
    if (!customers.length) {
      return res.status(404).json({ message: "No sold customers found" });
    }
    res.status(200).json(customers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/view/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Sold.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Sold customer not found" });
    }
    res.status(200).json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});



//update a customer
router.put(
  "/update/:id",
  upload.single("soldupload"),
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      // Check if file is uploaded
      if (req.file) {
        req.body.soldupload = `uploads/sold/${req.file.filename}`;
      }
      // Check if customer exists
      const customer = await Sold.findById(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Update customer
      const updatedCustomer = await Sold.findByIdAndUpdate(id, req.body, {
        new: true,
      });
      if (!updatedCustomer) {
        return res.status(400).json({ message: "Failed to update customer" });
      }

      res.status(200).json({
        message: "Customer updated successfully",
        customer: updatedCustomer,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  }
);

//get customer by name
// router.get("/search/:name", verifyToken, async (req, res) => {
//   try {
//     const { name } = req.params;

//     // Find customer by name
//     const customers = await Customer.find({ name: new RegExp(name, "i") });
//     if (!customers || customers.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "No customers found with that name" });
//     }

//     res.status(200).json(customers);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

// View a customers
// router.get("/view/:id", verifyToken, async (req, res) => {
//   try {
//     const { id } = req.params;

//     console.log(id);

//     // return;

//     const customer = await Customer.findById(id);
//     if (!customer) {
//       return res.status(404).json({ message: "Customer not found" });
//     }

//     res.status(200).json(customer);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Server error" });
//   }
// });

module.exports = router;
