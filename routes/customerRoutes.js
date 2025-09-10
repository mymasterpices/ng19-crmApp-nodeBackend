const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");

const Customer = require("../models/customerSchema");
const Chat = require("../models/chatSchema");
const { verifyToken } = require("../middleware/jwt");

// --------------------- Multer Storage ---------------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage });

// --------------------- SAVE CUSTOMER ---------------------
router.post(
  "/save",
  upload.single("productImage"),
  verifyToken,
  async (req, res) => {
    try {
      const {
        name,
        mobile,
        productName,
        price,
        nextFollowUpDate,
        status,
        seriousness,
        conversation,
        salesperson,
      } = req.body;

      const firstChatCo = req.body.conversation;

      if (!req.file) {
        return res.status(400).json({ message: "Please upload an image file" });
      }

      // Check if customer already exists
      const existingCustomer = await Customer.findOne({ mobile });
      if (existingCustomer) {
        return res
          .status(400)
          .json({ message: "Customer with this mobile number already exists" });
      }

      // Flatten status/seriousness if object
      const flatStatus =
        typeof status === "object" && status !== null ? status.name : status;
      const flatSeriousness =
        typeof seriousness === "object" && seriousness !== null
          ? seriousness.name
          : seriousness;

      const newCustomer = new Customer({
        name,
        mobile,
        productName,
        price,
        // ✅ Save exactly what Angular sends
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
        status: flatStatus,
        seriousness: flatSeriousness,
        conversation,
        salesperson,
        productImage: `uploads/${req.file.filename}`,
      });

      const savedCustomer = await newCustomer.save();

      if (savedCustomer) {
        const chat = new Chat({
          customerId: savedCustomer._id,
          messages: [
            {
              message: firstChatCo,
              timestamp: new Date(),
            },
          ],
        });
        await chat.save();
      }

      res.status(201).json({
        message: "Customer added successfully",
        customer: newCustomer,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  }
);

// --------------------- GET ALL CUSTOMERS ---------------------
router.get("/get", verifyToken, async (req, res) => {
  try {
    const customers = await Customer.find(req.query);
    if (!customers || customers.length === 0) {
      return res.status(404).json({ message: "No customers found" });
    }
    res.status(200).json(customers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- DELETE CUSTOMER ---------------------
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const deletedCustomer = await Customer.findByIdAndDelete(id);
    if (deletedCustomer) {
      await Chat.deleteOne({ customerId: id });

      const imagePath = deletedCustomer.productImage;
      if (imagePath) {
        try {
          fs.unlinkSync(imagePath);
        } catch (err) {
          console.error(err);
        }
      }
    }

    res.status(200).json({
      message: "Customer deleted successfully",
      customer,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- UPDATE CUSTOMER ---------------------
router.put(
  "/update/:id",
  upload.single("productImage"),
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;

      if (req.file) {
        req.body.productImage = `uploads/${req.file.filename}`;
      }

      if (req.body.status && typeof req.body.status === "object") {
        req.body.status = req.body.status.name;
      }
      if (req.body.seriousness && typeof req.body.seriousness === "object") {
        req.body.seriousness = req.body.seriousness.name;
      }

      // ✅ Preserve incoming Angular date with timezone
      if (req.body.nextFollowUpDate) {
        req.body.nextFollowUpDate = new Date(req.body.nextFollowUpDate);
      }

      const customer = await Customer.findById(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      const updatedCustomer = await Customer.findByIdAndUpdate(id, req.body, {
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

// --------------------- SEARCH BY NAME ---------------------
router.get("/search/:name", verifyToken, async (req, res) => {
  try {
    const { name } = req.params;
    const customers = await Customer.find({ name: new RegExp(name, "i") });
    if (!customers || customers.length === 0) {
      return res
        .status(404)
        .json({ message: "No customers found with that name" });
    }
    res.status(200).json(customers);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- VIEW CUSTOMER ---------------------
router.get("/view/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }
    res.status(200).json(customer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- FOLLOW-UP TODAY ---------------------
router.get("/followup/today", async (req, res) => {
  try {
    const now = new Date();

    // Local midnight (IST in this example)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    );

    const { salesperson } = req.query;

    const filter = {
      status: { $in: ["Cold", "Open"] },
      nextFollowUpDate: { $gte: today, $lt: tomorrow },
    };

    if (salesperson) {
      filter.salesperson = salesperson;
    }

    const customers = await Customer.find(filter);
    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching today follow-up customers:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- FOLLOW-UP MISSED ---------------------
router.get("/followup/missed", async (req, res) => {
  try {
    const now = new Date();

    // Local midnight (server local time zone)
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const { salesperson } = req.query;

    const filter = {
      status: { $in: ["Cold", "Open"] },
      // Anything strictly before today (local date) is "missed"
      nextFollowUpDate: { $lt: today },
    };

    if (salesperson) {
      filter.salesperson = salesperson;
    }

    const customers = await Customer.find(filter);
    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching missed follow-up customers:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
