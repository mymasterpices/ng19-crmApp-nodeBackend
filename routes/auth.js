const express = require("express");
const router = express.Router();

const User = require("../models/userSchema");
const authorizeRoles = require("../middleware/checkRoles");
// 1. Import necessary modules
const bcrypt = require("bcryptjs");
const { verifyToken, generateToken } = require("../middleware/jwt");

//get all users
router.get("/users", verifyToken, async (req, res) => {
  try {
    const { username } = req.query;
    let query = {};

    if (username) {
      // 'i' makes it case-insensitive, regex makes it a "contains" search
      query.username = { $regex: username, $options: "i" };
    }

    const users = await User.find(query).sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    // console.log(req.body);
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Create new user
    const newUser = new User({
      username,
      password: hashedPassword,
      role,
    });
    await newUser.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Check if user is active
    if (user.status !== "active") {
      return res.status(403).json({ message: "User account is inactive" });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Token payload
    const payload = {
      userId: user._id,
      username: user.username,
      role: user.role,
      status: user.status,
    };

    // Generate token
    const token = generateToken(payload);

    res.status(200).json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.delete(
  "/delete/:id",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const user = await User.findByIdAndDelete(userId);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

router.put(
  "/update/:id",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { username, password } = req.body;

      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      // Update user details
      user.username = username;
      user.password = await bcrypt.hash(password, 10);
      await user.save();
      res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Server error" });
    }
  },
);

router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.status(200).json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

//update /change password
router.patch("/update-password", verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { confirmNewPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    user.password = await bcrypt.hash(confirmNewPassword, 10);
    await user.save();
    res.status(200).json({ message: "Password updated successsssfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

//change user status by super admin or admin
router.patch(
  "/status",
  verifyToken,
    authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { status, id } = req.body;
      const user = await User.findById(id);
      if (!user) return res.status(404).json({ error: "User not found" });

      user.status = status;
      await user.save();
      res.status(200).json({ message: "User status updated successfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

//change user password by
router.patch(
  "/password",
  verifyToken,
  authorizeRoles("admin", "superadmin"),
  async (req, res) => {
    try {
      const { password, userid } = req.body;

      const user = await User.findById(userid);
      if (!user) return res.status(404).json({ error: "User not found" });

      user.password = await bcrypt.hash(password, 10);
      await user.save();
      res.status(200).json({ message: "Password updated successsssfully" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Server error" });
    }
  },
);

module.exports = router;
