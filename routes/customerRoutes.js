const express = require("express");
const router = express.Router();
const multer = require("multer");
const fs = require("fs");

const Customer = require("../models/customerSchema");
const Chat = require("../models/chatSchema");
const { verifyToken } = require("../middleware/jwt");

const getTodayDateISO = require("../utils/getTodayDate");

// Storage configuration for multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

//add new customer
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
        return res.status(400).json({ message: "Please upload a image file" });
      }

      // Check if customer already exists by mobile
      const existingCustomer = await Customer.findOne({ mobile });
      if (existingCustomer) {
        return res
          .status(400)
          .json({ message: "Customer with this mobile number already exists" });
      }

      // Create and save new customer
      const newCustomer = new Customer({
        name,
        mobile,
        productName,
        price,
        nextFollowUpDate,
        status,
        seriousness,
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
        console.log("Chat created:", chat);
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

//get all customers
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

//delete a customer
router.delete("/delete/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    // Delete customer
    const deletedCustomer = await Customer.findByIdAndDelete(id);
    if (deletedCustomer) {
      // Also delete associated chat
      await Chat.deleteOne({ customerId: id });
      //delete the image
      const imagePath = deletedCustomer.productImage;
      if (imagePath) {
        try {
          fs.unlinkSync(imagePath);
        } catch (err) {
          console.error(err);
        }
      }

      console.log("Chat deleted for customer:", id);
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

//update a customer
router.put(
  "/update/:id",
  upload.single("productImage"),
  verifyToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      // Check if file is uploaded
      if (req.file) {
        req.body.productImage = `uploads/${req.file.filename}`;
      }
      // Check if customer exists
      const customer = await Customer.findById(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Update customer
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

//get customer by name
router.get("/search/:name", verifyToken, async (req, res) => {
  try {
    const { name } = req.params;

    // Find customer by name
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

// View a customers
router.get("/view/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(id);

    // return;

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

// GET route to fetch customers with today's follow-up date and Cold/Open status
router.get("/followup/today", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today (00:00:00)

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1); // Start of tomorrow (00:00:00)

    const { salesperson } = req.query; // Optional filter (?salesperson=Anita)

    const filter = {
      status: { $in: ["Cold", "Open"] }, // ✅ Only Cold or Open
      nextFollowUpDate: {
        $gte: today, // >= today 00:00
        $lt: tomorrow, // < tomorrow 00:00 → ensures SAME day only
      },
    };

    if (salesperson) {
      filter.salesperson = salesperson;
    }

    const customers = await Customer.find(filter).sort({ updatedAt: -1 });

    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching today follow-up customers:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get customers with missed follow-ups
router.get("/followup/missed", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of today (00:00)

    const { salesperson } = req.query;

    // Filter: status Cold/Open AND nextFollowUpDate < today
    const filter = {
      status: { $in: ["Cold", "Open"] },
      nextFollowUpDate: { $lt: today },
    };

    if (salesperson) {
      filter.salesperson = salesperson; // Optional filter by salesperson
    }

    const customers = await Customer.find(filter);

    res.status(200).json(customers);
  } catch (error) {
    console.error("Error fetching missed follow-up customers:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
