const express = require("express");
const router = express.Router();
const FavoriteList = require("../models/favoriteListSchema");
const shareLink = require("../models/shareLinkSchema");
const { verifyToken, generateToken } = require("../middleware/jwt");

// GET FavoriteLists by customer
router.get("/get", verifyToken, async (req, res) => {
  try {
    const FavoriteListsData = await FavoriteList.find({}); // Query using the extracted value
    console.log(FavoriteList);
    return res.status(200).json(FavoriteListsData);
  } catch (error) {
    console.error("Error fetching Favorite lists by customer:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// GET FavoriteLists by customer
router.get("/:customerName", verifyToken, async (req, res) => {
  try {
    const { customerName } = req.params;
    if (!customerName) {
      return res.status(400).json({ message: "Customer name is required" });
    }
    const FavoriteListsData = await FavoriteList.find({ customerName }); // Query using the extracted value
    return res.status(200).json(FavoriteListsData);
  } catch (error) {
    console.error("Error fetching Favorite lists by customer:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

// POST new FavoriteList
router.post("/", async (req, res) => {
  const { favoriteList } = req.body;
  console.log(favoriteList);
  if (!favoriteList) {
    return res.status(400).json({ message: "FavoriteList object is required" });
  }

  const { token, favVideoIds: selectedList } = favoriteList;

  // Validate token
  if (!token) {
    return res.status(400).json({ message: "Token is required" });
  }

  // Validate selectedList
  if (
    !selectedList ||
    !Array.isArray(selectedList) ||
    selectedList.length === 0
  ) {
    return res.status(400).json({
      message: "Selected list is required and must be a non-empty array",
    });
  }

  // Validate customerName
  const getCustomer = await shareLink.findOne({ token });
  if (!getCustomer) {
    return res.status(404).json({ message: "Customer not found" });
  }

  try {
    // Create a new FavoriteList
    const newFavoriteList = new FavoriteList({
      token,
      favVideoIds: selectedList,
      customerName: getCustomer.customerName,
    });
    const savedFavoriteList = await newFavoriteList.save();

    // Send success response
    res.status(201).json({
      message: "FavoriteList created successfully",
      favoriteList: savedFavoriteList,
    });
  } catch (error) {
    console.error("Error creating FavoriteList:", error);
    res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const favoriteListId = req.params.id;
    const deletedFavoriteList = await FavoriteList.findByIdAndDelete(
      favoriteListId
    );
    if (!deletedFavoriteList) {
      return res.status(404).json({ message: "FavoriteList not found" });
    }
    res.status(200).json({
      message: "FavoriteList deleted successfully",
      FavoriteList: deletedFavoriteList,
    });
  } catch (error) {
    res.status(500).json({ message: "Error in deleting FavoriteList" });
  }
});

module.exports = router;
